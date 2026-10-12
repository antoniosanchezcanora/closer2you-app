import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Badge, Button, Card, Initial, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import { supabase } from '../lib/supabase';
import { MAX_OFERTAS_DIA } from '../lib/types';
import type { Offer, Reservation, ReservationStatus, Shop } from '../lib/types';
import { colors, hhmm } from '../theme';

const LABEL: Record<ReservationStatus, string> = {
  nueva: 'Nueva', lista: 'Para recoger', recogida: 'Recogida', rechazada: 'Sin stock', cancelada: 'Cancelada', no_show: 'No vino',
};
const TONE: Record<ReservationStatus, { color: string; soft: string }> = {
  nueva: { color: colors.gold, soft: colors.goldSoft },
  lista: { color: colors.green, soft: colors.greenSoft },
  recogida: { color: colors.muted, soft: '#EEEFF1' },
  rechazada: { color: colors.muted, soft: '#EEEFF1' },
  cancelada: { color: colors.muted, soft: '#EEEFF1' },
  no_show: { color: colors.muted, soft: '#EEEFF1' },
};

export default function TiendaHoy({ onNewOffer }: { onNewOffer: () => void }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [myOffers, setMyOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [s, r, o] = await Promise.all([repo.myShop(), repo.shopReservations(), repo.shopOffersToday()]);
      setShop(s);
      setRows(r);
      setMyOffers(o);
      setNow(Date.now());
    } catch (e: any) {
      Alert.alert('No se ha podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
    // En modo real, las reservas nuevas llegan al momento.
    if (!supabase) return;
    const ch = supabase.channel('reservas').on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => load()).subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [load]);

  const act = async (id: string, status: ReservationStatus) => {
    setBusyId(id);
    try {
      await repo.setStatus(id, status);
      await load();
    } catch (e: any) {
      Alert.alert('No se ha podido cambiar', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = (o: Offer) => {
    Alert.alert('Retirar oferta', `"${o.title}" desaparecerá de la calle. Las reservas ya hechas se mantienen.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Retirar', style: 'destructive', onPress: async () => { try { await repo.withdrawOffer(o.id); await load(); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  };

  const confirm = async () => {
    try {
      const name = await repo.confirmNeighbour(code);
      setConfirmed(name);
    } catch (e: any) {
      Alert.alert('No se ha podido confirmar', e.message);
    }
  };

  if (!loading && !shop) {
    return (
      <View style={st.empty}>
        <Text style={T.h1}>Tu tienda aún no está dada de alta</Text>
        <Text style={T.small}>Te la activamos en persona cuando pasemos por la tienda.</Text>
      </View>
    );
  }

  const used = shop?.free_reservations_used ?? 0;
  const madrid = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  const today = madrid(new Date().toISOString());
  const publishedToday = myOffers.filter((o) => o.created_at && madrid(o.created_at) === today).length;
  const live = myOffers.filter((o) => o.active !== false && o.qty_left > 0 && new Date(o.until).getTime() > now);
  const nuevas = rows.filter((r) => r.status === 'nueva').length;
  const porRecoger = rows.filter((r) => r.status === 'lista').length;

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={st.header}>
        <Initial name={shop?.name ?? 'T'} size={48} square />
        <View style={{ flex: 1 }}>
          <Text style={T.h1}>{shop?.name ?? ' '}</Text>
          <Text style={[T.small, { color: colors.green, fontWeight: '600' }]}>Modo tienda · {shop?.hours ?? 'hoy'}</Text>
        </View>
      </View>

      <View style={st.stats}>
        <Stat n={rows.length} label="reservas hoy" />
        <Stat n={nuevas} label="nuevas" />
        <Stat n={porRecoger} label="por recoger" />
      </View>

      <Card>
        <View style={st.row}>
          <Text style={T.strong}>Reservas gratis</Text>
          <Text style={T.strong}>{used} de 10</Text>
        </View>
        <View style={st.bar} accessibilityLabel={`${used} de 10 reservas gratis usadas`}>
          <View style={[st.barFill, { width: `${used * 10}%` }]} />
        </View>
        <Text style={T.small}>
          {used < 10
            ? `Te quedan ${10 - used} reservas gratis. Solo cuentan las que el vecino recoge.`
            : 'Ya has usado las 10 gratis. Hablamos contigo para elegir la cuota.'}
        </Text>
      </Card>

      <View style={st.row}>
        <Button label="Publicar oferta" onPress={onNewOffer} style={{ flex: 1 }} />
        <Button label="Confirmar vecino" tone="ghost" onPress={() => { setVerifyOpen(!verifyOpen); setConfirmed(null); }} style={{ flex: 1 }} />
      </View>

      {verifyOpen && (
        <Card tint={colors.blueSoft} style={{ gap: 10 }}>
          <Text style={[T.body, { fontSize: 15 }]}>Escribe el código que te enseña. Confirma solo si sabes que vive por aquí.</Text>
          <View style={st.row}>
            <TextInput
              value={code}
              onChangeText={(t) => { setCode(t.toUpperCase()); setConfirmed(null); }}
              placeholder="LACY-0000"
              autoCapitalize="characters"
              accessibilityLabel="Código del vecino"
              style={st.input}
            />
            <Button label="Confirmar" tone="blue" onPress={confirm} disabled={code.length < 6} />
          </View>
          {confirmed && <Text style={T.strong}>Hecho. {confirmed} ya puede reservar en el barrio.</Text>}
        </Card>
      )}

      <Label>En la calle ahora</Label>
      <View style={st.group}>
        <View style={[st.line, { justifyContent: 'space-between' }]}>
          <Text style={T.small}>Publicadas hoy</Text>
          <Text style={T.strong}>{publishedToday} de {MAX_OFERTAS_DIA}</Text>
        </View>
        {live.length === 0 && <View style={[st.line, st.sep]}><Text style={T.small}>No tienes ofertas activas.</Text></View>}
        {live.map((o) => (
          <View key={o.id} style={[st.line, st.sep]}>
            <View style={{ flex: 1 }}>
              <Text style={[T.body, { fontSize: 15 }]}>{o.title}</Text>
              <Text style={T.small}>Quedan {o.qty_left} · hasta las {hhmm(o.until)}</Text>
            </View>
            <Button small label="Retirar" tone="soft" onPress={() => withdraw(o)} />
          </View>
        ))}
      </View>

      <Label>Reservas de hoy</Label>
      {rows.length === 0 && !loading && <Note>Todavía no hay reservas. Publica una oferta y los vecinos de tu calle la verán al momento.</Note>}
      {rows.map((r) => {
        const done = !['nueva', 'lista'].includes(r.status);
        return (
          <Card key={r.id} style={done ? { opacity: 0.6 } : undefined}>
            <View style={st.row}>
              <Initial name={r.neighbour_name} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={T.strong}>{r.neighbour_name}{r.pickup_at ? ` · ${hhmm(r.pickup_at)}` : ''}</Text>
                <Text style={T.small}>{r.qty > 1 ? `${r.qty} × ` : ''}{r.offer_title}</Text>
              </View>
              <Badge label={LABEL[r.status]} color={TONE[r.status].color} soft={TONE[r.status].soft} />
            </View>
            {!!r.note && !done && <Text style={st.note}>{r.note}</Text>}
            {r.status === 'nueva' && (
              <View style={st.row}>
                <Button label="Aceptar y preparar" busy={busyId === r.id} onPress={() => act(r.id, 'lista')} style={{ flex: 1 }} />
                <Button label="No me queda" tone="ghost" onPress={() => act(r.id, 'rechazada')} />
              </View>
            )}
            {r.status === 'lista' && (
              <View style={st.row}>
                <Button label="Ya lo ha recogido" busy={busyId === r.id} onPress={() => act(r.id, 'recogida')} style={{ flex: 1 }} />
                <Button label="No vino" tone="ghost" onPress={() => act(r.id, 'no_show')} />
              </View>
            )}
          </Card>
        );
      })}
      <Text style={[T.small, { marginBottom: 24, textAlign: 'center' }]}>Sin pagos en la app: el vecino reserva y te paga a ti al recoger.</Text>
    </ScrollView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statN}>{n}</Text>
      <Text style={T.small}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 2 },
  statN: { fontSize: 22, fontWeight: '700', color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  bar: { height: 8, borderRadius: 999, backgroundColor: '#EEEFF1', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: colors.green },
  input: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, fontWeight: '600', color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
  note: { backgroundColor: colors.goldSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: colors.ink },
  empty: { flex: 1, padding: 24, justifyContent: 'center', gap: 8 },
});
