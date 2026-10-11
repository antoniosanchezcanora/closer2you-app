import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, T, Tag } from '../components/ui';
import { repo } from '../lib/repo';
import { supabase } from '../lib/supabase';
import type { Reservation, ReservationStatus, Shop } from '../lib/types';
import { colors, hhmm } from '../theme';

const LABEL: Record<ReservationStatus, string> = {
  nueva: 'Nueva', lista: 'Para recoger', recogida: 'Recogida', rechazada: 'Sin stock', cancelada: 'Cancelada', no_show: 'No vino',
};
const TAG_BG: Record<ReservationStatus, string> = {
  nueva: colors.yellow, lista: colors.mintSoft, recogida: '#EDE8F7', rechazada: colors.line, cancelada: colors.line, no_show: colors.line,
};
const AVATARS = [colors.pink, colors.lilac, colors.yellow, colors.mint, colors.peach];

export default function TiendaHoy({ onNewOffer }: { onNewOffer: () => void }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([repo.myShop(), repo.shopReservations()]);
      setShop(s);
      setRows(r);
    } catch (e: any) {
      Alert.alert('No se ha podido cargar', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
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
        <Text style={T.h2}>Tu tienda aún no está dada de alta</Text>
        <Text style={T.small}>Te la activamos en persona cuando pasemos por la tienda.</Text>
      </View>
    );
  }

  const used = shop?.free_reservations_used ?? 0;
  const nuevas = rows.filter((r) => r.status === 'nueva').length;

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={st.header}>
        <View style={st.logo} />
        <View style={{ flex: 1 }}>
          <Text style={T.h1}>{shop?.name ?? ' '}</Text>
          <Text style={T.small}>{[shop?.hours, nuevas ? `${nuevas} reservas nuevas` : 'Sin reservas nuevas'].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>

      <Card strong>
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
            : 'Ya has usado las 10 gratis. Hablamos para elegir: porcentaje por reserva o cuota al mes.'}
        </Text>
      </Card>

      <View style={st.row}>
        <Button label="Publicar oferta" onPress={onNewOffer} style={{ flex: 1 }} />
        <Button label="Confirmar vecino" tone="white" onPress={() => { setVerifyOpen(!verifyOpen); setConfirmed(null); }} style={{ flex: 1 }} />
      </View>

      {verifyOpen && (
        <View style={st.verify}>
          <Text style={T.body}>Escribe el código que te enseña. Confirma solo si sabes que vive por aquí.</Text>
          <View style={st.row}>
            <TextInput
              value={code}
              onChangeText={(t) => { setCode(t.toUpperCase()); setConfirmed(null); }}
              placeholder="LACY-0000"
              autoCapitalize="characters"
              accessibilityLabel="Código del vecino"
              style={st.input}
            />
            <Button label="Confirmar" tone="mint" onPress={confirm} disabled={code.length < 6} />
          </View>
          {confirmed && <Text style={T.strong}>Hecho. {confirmed} ya puede reservar en el barrio.</Text>}
        </View>
      )}

      <Text style={[T.h2, { marginTop: 4 }]}>Reservas de hoy</Text>
      {rows.length === 0 && !loading && <Text style={T.small}>Todavía no hay reservas. Publica una oferta para que se encienda tu ventana.</Text>}
      {rows.map((r, i) => {
        const done = !['nueva', 'lista'].includes(r.status);
        return (
          <Card key={r.id} strong={r.status === 'nueva'} style={done ? { opacity: 0.65 } : undefined}>
            <View style={st.row}>
              <Avatar name={r.neighbour_name} bg={AVATARS[i % AVATARS.length]} />
              <View style={{ flex: 1 }}>
                <Text style={T.strong}>{r.neighbour_name}{r.pickup_at ? ` · ${hhmm(r.pickup_at)}` : ''}</Text>
                <Text style={T.small}>{r.qty > 1 ? `${r.qty} × ` : ''}{r.offer_title}</Text>
              </View>
              <Tag label={LABEL[r.status]} bg={TAG_BG[r.status]} color={done ? colors.muted : undefined} />
            </View>
            {!!r.note && !done && <Text style={st.note}>{r.note}</Text>}
            {r.status === 'nueva' && (
              <View style={st.row}>
                <Button label="Aceptar y preparar" tone="mint" busy={busyId === r.id} onPress={() => act(r.id, 'lista')} style={{ flex: 1 }} />
                <Button label="No me queda" tone="ghost" onPress={() => act(r.id, 'rechazada')} />
              </View>
            )}
            {r.status === 'lista' && (
              <View style={st.row}>
                <Button label="Ya lo ha recogido" tone="mint" busy={busyId === r.id} onPress={() => act(r.id, 'recogida')} style={{ flex: 1 }} />
                <Button label="No vino" tone="ghost" onPress={() => act(r.id, 'no_show')} />
              </View>
            )}
          </Card>
        );
      })}
      <Text style={[T.small, { marginBottom: 24 }]}>Sin pagos en la app: el vecino reserva y paga en la tienda al recoger.</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 14, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.peach },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  bar: { height: 12, borderRadius: 999, backgroundColor: '#F1EADF', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: colors.mint },
  verify: { backgroundColor: colors.lilacSoft, borderRadius: 18, padding: 12, gap: 8 },
  input: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, fontWeight: '700', color: colors.ink },
  note: { backgroundColor: colors.cream, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, fontWeight: '600', color: colors.ink },
  empty: { flex: 1, padding: 24, justifyContent: 'center', gap: 8 },
});
