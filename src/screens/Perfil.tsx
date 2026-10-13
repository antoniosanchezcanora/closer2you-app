import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Badge, Initial, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { Me, Shop } from '../lib/types';
import { colors } from '../theme';

export default function Perfil({ me, shop, unread, onAvisos, onShopMode, onServicio, onAlta, onLoMio, onSignOut }: { me: Me | null; shop: Shop | null; unread: number; onAvisos: () => void; onShopMode: () => void; onServicio?: () => void; onAlta: () => void; onLoMio?: () => void; onSignOut: () => void }) {
  const [stats, setStats] = useState({ reservas: 0, tiendas: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([repo.myReservations(), repo.myMenuReservations()]);
      const hechas = r.filter((x) => x.status === 'recogida');
      setStats({ reservas: hechas.length + m.filter((x) => x.status === 'recogida').length, tiendas: new Set([...hechas.map((x) => x.shop_id), ...m.map((x) => x.shop_id)]).size });
    } catch {
      // el perfil se ve igual aunque falten las cifras
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const exportar = async () => {
    try {
      const json = await repo.exportMyData();
      await Share.share({ title: 'Mis datos de Stoop', message: json });
    } catch (e: any) {
      Alert.alert('No se ha podido', e.message);
    }
  };

  const borrar = () => {
    Alert.alert('Borrar mi cuenta', 'Dejas de estar verificado y se anulan tus reservas abiertas desde ahora. Borramos todos tus datos en menos de un mes, como marca la ley. ¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar mi cuenta', style: 'destructive', onPress: async () => {
        try {
          await repo.requestDeletion();
          Alert.alert('Hecho', 'Hemos recibido tu petición. Te cerramos la sesión.');
          onSignOut();
        } catch (e: any) {
          Alert.alert('No se ha podido', e.message);
        }
      } },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={st.wrap} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={st.hero}>
        <Initial name={me?.name ?? 'T'} size={84} />
        <Text style={T.h1}>{me?.name}</Text>
        {me?.verified
          ? <Badge label={`Verificado por ${me.verifiedBy ?? 'una tienda del barrio'}`} color={colors.green} soft={colors.greenSoft} />
          : <Badge label="Sin verificar" color={colors.gold} soft={colors.goldSoft} />}
      </View>

      <View style={st.stats}>
        <View style={st.stat}><Text style={st.statN}>{stats.reservas}</Text><Text style={T.small}>compras en tu calle</Text></View>
        <View style={st.stat}><Text style={st.statN}>{stats.tiendas}</Text><Text style={T.small}>tiendas tuyas</Text></View>
      </View>

      {onLoMio && (
        <View style={st.group}>
          <Row title="Lo mío" sub="Tu nivel, tu banco de tiempo y lo que has pedido u ofrecido" onPress={onLoMio} />
        </View>
      )}

      <Label>Tu negocio</Label>
      {shop
        ? <Row title={shop.tipo === 'restaurante' ? 'Modo restaurante' : 'Modo tienda'} sub={`${shop.name} · reservas, publicar y ajustes`} onPress={onShopMode} accent />
        : <View style={st.group}><Row title="Tengo un negocio en el barrio" sub="Activa tu tienda con el código de la visita o pide el alta" onPress={onAlta} /></View>}
      {shop && <Text style={[T.small, { color: colors.green }]} onPress={onAlta}>+ Añadir otro negocio</Text>}

      {onServicio && (
        <>
          <Label>Profesionales</Label>
          <View style={st.group}>
            <Row title="Ofrecer un servicio profesional" sub="Para autónomos del barrio. Te visitamos antes de aparecer." onPress={onServicio} />
          </View>
        </>
      )}

      <Label>Ajustes</Label>
      <View style={st.group}>
        <Row title="Avisos" sub="Reservas, entregas y tu verificación" right={unread ? <Badge label={String(unread)} color={colors.red} /> : undefined} onPress={onAvisos} />
        <Row title="Letra grande" sub="Stoop usa el tamaño de letra de tu móvil: Ajustes > Pantalla y brillo > Tamaño del texto" sep />
        <Row title="Quién ve mi perfil" sub="Solo las tiendas en las que reservas ven tu nombre. Tu dirección, nadie." sep />
      </View>

      <Label>Mis datos</Label>
      <View style={st.group}>
        <Row title="Descargar mis datos" sub="Todo lo que Stoop guarda de ti, en un archivo" onPress={exportar} />
        <Row title="Cerrar sesión" sub="En este móvil" onPress={onSignOut} sep />
        <Row title="Borrar mi cuenta" sub="Derecho de supresión" onPress={borrar} sep danger />
      </View>
      <Note>Tus datos se guardan en servidores de la Unión Europea. Nunca los vendemos ni los usamos para publicidad.</Note>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function Row({ title, sub, onPress, right, sep, accent, danger }: { title: string; sub?: string; onPress?: () => void; right?: React.ReactNode; sep?: boolean; accent?: boolean; danger?: boolean }) {
  const body = (
    <View style={[st.row, sep && st.sep, accent && { backgroundColor: colors.greenSoft, borderRadius: 16 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[T.strong, danger && { color: colors.red }, accent && { color: '#1F4A37' }]}>{title}</Text>
        {!!sub && <Text style={T.small}>{sub}</Text>}
      </View>
      {right}
      {onPress && <Text style={{ color: colors.faint, fontSize: 18 }}>›</Text>}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>{body}</Pressable> : body;
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  hero: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 12, gap: 2 },
  statN: { fontSize: 22, fontWeight: '700', color: colors.ink },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'transparent' },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
});
