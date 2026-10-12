import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button, T } from './src/components/ui';
import { repo } from './src/lib/repo';
import { supabase } from './src/lib/supabase';
import type { Me } from './src/lib/types';
import Login from './src/screens/Login';
import TiendaHoy from './src/screens/TiendaHoy';
import TiendaOferta from './src/screens/TiendaOferta';
import VecinoHoy from './src/screens/VecinoHoy';
import { colors } from './src/theme';

type Tab = 'calle' | 'tienda' | 'oferta';

export default function App() {
  const [tab, setTab] = useState<Tab>('calle');
  const [signedIn, setSignedIn] = useState(repo.mode === 'demo');
  // undefined = cargando; null = aún no ha dicho cómo se llama
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [hasShop, setHasShop] = useState(false);

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
      setHasShop(!!shop);
    } catch (e: any) {
      setMe(null);
      Alert.alert('No se ha podido cargar tu perfil', e.message);
    }
  }, []);

  useEffect(() => {
    if (signedIn) loadMe();
    else { setMe(undefined); setHasShop(false); setTab('calle'); }
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
              {tab === 'calle' && <VecinoHoy me={me ?? null} onVerified={loadMe} />}
              {tab === 'tienda' && hasShop && <TiendaHoy onNewOffer={() => setTab('oferta')} />}
              {tab === 'oferta' && hasShop && <TiendaOferta onDone={() => setTab('tienda')} />}
            </View>
            {hasShop && (
              <View style={st.nav} accessibilityRole="tablist">
                <NavItem label="Mi calle" on={tab === 'calle'} onPress={() => setTab('calle')} />
                <NavItem label="Mi tienda" on={tab === 'tienda'} onPress={() => setTab('tienda')} />
                <NavItem label="Ofertas" on={tab === 'oferta'} onPress={() => setTab('oferta')} />
              </View>
            )}
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

function NavItem({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={onPress} style={st.navItem}>
      <View style={[st.navIcon, on ? { backgroundColor: colors.green, borderColor: colors.green } : null]} />
      <Text style={[st.navText, on && { color: colors.green }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.gold, paddingVertical: 4, backgroundColor: colors.goldSoft },
  nav: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#E4E6E9', paddingTop: 8, paddingBottom: 4 },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navIcon: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colors.faint },
  navText: { fontSize: 12, fontWeight: '600', color: colors.faint },
  setup: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
});
