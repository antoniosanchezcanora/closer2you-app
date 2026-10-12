import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button, Segment, T } from './src/components/ui';
import { repo } from './src/lib/repo';
import { supabase } from './src/lib/supabase';
import type { Me, Shop } from './src/lib/types';
import Login from './src/screens/Login';
import TiendaAjustes from './src/screens/TiendaAjustes';
import TiendaHoy from './src/screens/TiendaHoy';
import TiendaMenu from './src/screens/TiendaMenu';
import TiendaOferta from './src/screens/TiendaOferta';
import Tiendas from './src/screens/Tiendas';
import VecinoHoy from './src/screens/VecinoHoy';
import { colors } from './src/theme';

type Tab = 'calle' | 'tiendas' | 'tienda' | 'oferta' | 'ajustes';

export default function App() {
  const [tab, setTab] = useState<Tab>('calle');
  const [signedIn, setSignedIn] = useState(repo.mode === 'demo');
  // undefined = cargando; null = aún no ha dicho cómo se llama
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [myShop, setMyShop] = useState<Shop | null>(null);
  const [openShop, setOpenShop] = useState<string | null>(null);
  const [publish, setPublish] = useState<'menu' | 'oferta'>('menu');
  const hasShop = !!myShop;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const [m, shop] = await Promise.all([repo.me(), repo.myShop()]);
      setMe(m);
      setMyShop(shop);
    } catch (e: any) {
      setMe(null);
      Alert.alert('No se ha podido cargar tu perfil', e.message);
    }
  }, []);

  useEffect(() => {
    if (signedIn) loadMe();
    else { setMe(undefined); setMyShop(null); setTab('calle'); setOpenShop(null); }
  }, [signedIn, loadMe]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {repo.mode === 'demo' && <Text style={st.demo}>Modo demostración: datos de ejemplo</Text>}
        {!signedIn ? (
          <Login />
        ) : me === null ? (
          <NameSetup onDone={loadMe} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {tab === 'calle' && <VecinoHoy me={me ?? null} onVerified={loadMe} onSignOut={() => { repo.signOut().catch((e: any) => Alert.alert('Error', e.message)); }} onOpenShop={(id) => { setOpenShop(id); setTab('tiendas'); }} />}
              {tab === 'tiendas' && <Tiendas verified={!!me?.verified} openShopId={openShop} onOpenShop={setOpenShop} onCloseShop={() => setOpenShop(null)} />}
              {tab === 'tienda' && hasShop && <TiendaHoy onNewOffer={() => setTab('oferta')} onSettings={() => setTab('ajustes')} onShopChange={loadMe} />}
              {tab === 'ajustes' && hasShop && <TiendaAjustes onDone={() => { loadMe(); setTab('tienda'); }} />}
              {tab === 'oferta' && hasShop && myShop && (
                myShop.tipo === 'restaurante' ? (
                  <View style={{ flex: 1 }}>
                    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                      <Segment items={[{ id: 'menu', label: 'Menú del día' }, { id: 'oferta', label: 'Oferta' }]} value={publish} onChange={setPublish} />
                    </View>
                    {publish === 'menu' ? <TiendaMenu shop={myShop} onDone={() => setTab('tienda')} /> : <TiendaOferta onDone={() => setTab('tienda')} />}
                  </View>
                ) : <TiendaOferta onDone={() => setTab('tienda')} />
              )}
            </View>
            <View style={st.nav} accessibilityRole="tablist">
              <NavItem label="Mi calle" icon="calle" on={tab === 'calle'} onPress={() => setTab('calle')} />
              <NavItem label="Tiendas" icon="tiendas" on={tab === 'tiendas'} onPress={() => { setOpenShop(null); setTab('tiendas'); }} />
              {hasShop && <NavItem label={myShop?.tipo === 'restaurante' ? 'Mi bar' : 'Mi tienda'} icon="mitienda" on={tab === 'tienda' || tab === 'ajustes'} onPress={() => setTab('tienda')} />}
              {hasShop && <NavItem label="Publicar" icon="publicar" on={tab === 'oferta'} onPress={() => setTab('oferta')} />}
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// Si la cuenta se confirmó por correo, el perfil se crea aquí la primera vez que entra.
function NameSetup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await repo.createProfile(name);
      onDone();
    } catch (e: any) {
      Alert.alert('No se ha podido guardar', e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={st.setup}>
      <Text style={T.kicker}>UN ÚLTIMO PASO</Text>
      <Text style={T.title}>¿Cómo te llaman en el barrio?</Text>
      <Text style={T.small}>Es lo que verán las tiendas cuando reserves. Nunca pedimos portal ni piso.</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Tu nombre" accessibilityLabel="Nombre" style={st.input} maxLength={40} />
      <Button label="Guardar" busy={busy} disabled={name.trim().length < 1} onPress={save} />
    </View>
  );
}

const ICONS = {
  calle: 'M4 11 L12 4 L20 11 V20 H4 Z M10 20 V15 H14 V20',
  tiendas: 'M4 9 L5.5 4.5 H18.5 L20 9 Z M5 9 V20 H19 V9 M10 20 V15 H14 V20',
  mitienda: 'M6 8.5 H18 L17 20 H7 Z M9 8.5 V7 A3 3 0 0 1 15 7 V8.5',
  publicar: 'M4.5 12 L12 4.5 H19.5 V12 L12 19.5 Z M15.5 8.5 h.01',
} as const;

function NavItem({ label, icon, on, onPress }: { label: string; icon: keyof typeof ICONS; on: boolean; onPress: () => void }) {
  const c = on ? colors.green : colors.faint;
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} style={st.navItem}>
      <Svg width={24} height={24} viewBox="0 0 24 24"><Path d={ICONS[icon]} fill="none" stroke={c} strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" /></Svg>
      <Text style={[st.navText, { color: c }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.gold, paddingVertical: 4, backgroundColor: colors.goldSoft },
  nav: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#E4E6E9', paddingTop: 8, paddingBottom: 4 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navText: { fontSize: 12, fontWeight: '600', color: colors.faint },
  setup: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
});
