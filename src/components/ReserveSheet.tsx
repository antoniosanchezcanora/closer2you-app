import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { repo } from '../lib/repo';
import type { DeliveryMode, Menu, MenuMode, Offer, Shop } from '../lib/types';
import { colors, eur, hhmm } from '../theme';
import { Badge, Button, Chip, Label, T } from './ui';

export type ReserveTarget = { type: 'offer'; offer: Offer; shop?: Shop } | { type: 'menu'; menu: Menu; shop?: Shop };

const HORAS = ['13:30', '14:00', '14:30', '15:00', '15:30'];

// Hoja para reservar: recoger o que te lo traigan (ofertas), o comer allí, para llevar o a casa (menú).
export function ReserveSheet({ target, onClose, onDone }: { target: ReserveTarget | null; onClose: () => void; onDone: (msg: string) => void }) {
  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.backdrop}>
        {target && <Sheet key={target.type === 'offer' ? target.offer.id : target.menu.id} target={target} onClose={onClose} onDone={onDone} />}
      </View>
    </Modal>
  );
}

function Sheet({ target, onClose, onDone }: { target: ReserveTarget; onClose: () => void; onDone: (msg: string) => void }) {
  const shop = target.shop;
  const isMenu = target.type === 'menu';
  const maxQty = isMenu ? Math.min(4, target.menu.qty_left) : Math.min(10, target.offer.qty_left);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState<DeliveryMode | MenuMode>(isMenu ? 'aqui' : 'recogida');
  const [address, setAddress] = useState('');
  const [slot, setSlot] = useState<string | undefined>(shop?.delivery_slots?.[0]);
  const [hora, setHora] = useState('14:00');
  const [busy, setBusy] = useState(false);

  const price = isMenu ? target.menu.price_cents : target.offer.price_cents;
  const canDeliver = isMenu ? target.menu.delivery : !!shop?.delivery_enabled;
  const fee = shop && shop.delivery_free_from_cents && price * qty >= shop.delivery_free_from_cents ? 0 : shop?.delivery_fee_cents ?? 0;
  const entrega = mode === 'entrega';
  const ready = !entrega || address.trim().length >= 5;

  const confirm = async () => {
    setBusy(true);
    try {
      if (target.type === 'menu') {
        await repo.reserveMenu(target.menu.id, qty, mode as MenuMode, hora, address);
        onDone(mode === 'aqui' ? `Mesa para ${qty} a las ${hora}. Pagas en el bar.` : mode === 'llevar' ? `Lo recoges a las ${hora}. Pagas en el bar.` : `Te lo llevan sobre las ${hora}. Pagas al recibirlo.`);
      } else {
        await repo.reserve(target.offer.id, qty, { mode: mode as DeliveryMode, address, slot });
        onDone(entrega ? `Te lo llevan ${slot ? 'de ' + slot : 'hoy'}. Pagas a la tienda al recibirlo.` : `Te lo guardan hasta las ${hhmm(target.offer.until)}. Pagas en la tienda.`);
      }
    } catch (e: any) {
      Alert.alert('No se ha podido reservar', e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = target.type === 'menu' ? 'Menú del día' : target.offer.title;
  const shopName = target.type === 'menu' ? target.menu.shop_name : target.offer.shop_name;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheet}>
      <View style={st.grab} />
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={T.small}>{shopName}</Text>
            <Text style={T.h1}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={st.close}><Text style={{ fontSize: 22, color: colors.muted }}>×</Text></Pressable>
        </View>

        {target.type === 'menu' && (
          <View style={st.box}>
            <Text style={T.body}><Text style={T.strong}>Primero: </Text>{target.menu.starters}</Text>
            <Text style={T.body}><Text style={T.strong}>Segundo: </Text>{target.menu.mains}</Text>
            {!!target.menu.includes && <Text style={T.small}>{target.menu.includes}</Text>}
            <Text style={[T.small, { fontWeight: '700', marginTop: 4 }]}>ALÉRGENOS</Text>
            <View style={st.wrap}>
              {target.menu.allergens.length === 0
                ? <Text style={T.small}>El restaurante declara que no contiene alérgenos de declaración obligatoria.</Text>
                : target.menu.allergens.map((a) => <Badge key={a} label={a} color="#8A5A12" soft={colors.goldSoft} />)}
            </View>
          </View>
        )}

        <View style={[st.row, st.box]}>
          <Text style={[T.body, { flex: 1 }]}>{target.type === 'menu' ? 'Menús' : 'Cantidad'}</Text>
          <Button small label="−" tone="soft" onPress={() => setQty(Math.max(1, qty - 1))} />
          <Text style={st.qty}>{qty}</Text>
          <Button small label="+" tone="soft" onPress={() => setQty(Math.min(maxQty, qty + 1))} />
        </View>

        <Label>¿Cómo lo quieres?</Label>
        {target.type === 'menu' ? (
          <>
            <Option on={mode === 'aqui'} title="Como allí" sub="Te guardan sitio" onPress={() => setMode('aqui')} />
            {target.menu.takeaway && <Option on={mode === 'llevar'} title="Para llevar" sub="Lo recoges en la barra" onPress={() => setMode('llevar')} />}
            {canDeliver && <Option on={mode === 'entrega'} title="Me lo traen" sub={`${shop?.delivery_by ? shop.delivery_by + ' · ' : ''}${fee ? eur(fee) : 'gratis'}`} onPress={() => setMode('entrega')} />}
            <Label>A qué hora</Label>
            <View style={st.wrap}>{HORAS.map((h) => <Chip key={h} label={h} on={hora === h} onPress={() => setHora(h)} color={colors.wine} />)}</View>
          </>
        ) : (
          <>
            <Option on={mode === 'recogida'} title="Recojo en la tienda" sub={`Te lo guardan hasta las ${hhmm(target.offer.until)} · gratis`} onPress={() => setMode('recogida')} />
            {canDeliver
              ? <Option on={mode === 'entrega'} title="Me lo traen" sub={`${shop?.delivery_by ? 'Lo lleva ' + shop.delivery_by + ' · ' : ''}${fee ? eur(fee) : 'gratis'}${shop?.delivery_free_from_cents ? ' · gratis desde ' + eur(shop.delivery_free_from_cents) : ''}`} onPress={() => setMode('entrega')} />
              : <Text style={T.small}>Esta tienda todavía no hace entregas.</Text>}
            {entrega && !!shop?.delivery_slots?.length && (
              <View style={st.wrap}>{shop.delivery_slots.map((s) => <Chip key={s} label={s} on={slot === s} onPress={() => setSlot(s)} color={colors.green} />)}</View>
            )}
          </>
        )}

        {entrega && (
          <View style={{ gap: 6 }}>
            <TextInput value={address} onChangeText={setAddress} placeholder="Tu dirección: calle, número, piso" accessibilityLabel="Dirección de entrega" style={st.input} maxLength={140} />
            <Text style={[T.small, { color: colors.green }]}>Solo la ve esta tienda para este pedido y se borra al entregarlo.</Text>
          </View>
        )}

        <View style={st.total}>
          <Text style={T.body}>Total que pagas {target.type === 'menu' ? 'en el bar' : 'en la tienda'}</Text>
          <Text style={T.strong}>{eur(price * qty + (entrega ? fee : 0))}</Text>
        </View>
        <Button label={target.type === 'menu' ? 'Reservar mi menú' : 'Confirmar reserva'} tone={target.type === 'menu' ? 'wine' : 'primary'} busy={busy} disabled={!ready} onPress={confirm} />
        <Text style={[T.small, { textAlign: 'center' }]}>Nunca pagas en la app.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Option({ on, title, sub, onPress }: { on: boolean; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={[st.option, on && st.optionOn]}>
      <View style={[st.dot, on && st.dotOn]} />
      <View style={{ flex: 1 }}>
        <Text style={T.strong}>{title}</Text>
        <Text style={T.small}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,35,40,.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8 },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#C9CDD3', alignSelf: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  box: { backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  qty: { minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.ink },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 2, borderColor: 'transparent' },
  optionOn: { borderColor: colors.green },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B8BDC4' },
  dotOn: { borderColor: colors.green, backgroundColor: colors.green },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
});
