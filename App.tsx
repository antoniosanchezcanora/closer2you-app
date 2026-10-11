import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import { repo } from './src/lib/repo';
import Login from './src/screens/Login';
import TiendaHoy from './src/screens/TiendaHoy';
import TiendaOferta from './src/screens/TiendaOferta';
import VecinoHoy from './src/screens/VecinoHoy';
import { colors } from './src/theme';

type Tab = 'vecino' | 'tienda' | 'oferta';

export default function App() {
  const [tab, setTab] = useState<Tab>('vecino');
  const [signedIn, setSignedIn] = useState(repo.mode === 'demo');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {repo.mode === 'demo' && <Text style={st.demo}>Modo demostración: datos de ejemplo</Text>}
        {!signedIn ? (
          <Login />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {tab === 'vecino' && <VecinoHoy />}
              {tab === 'tienda' && <TiendaHoy onNewOffer={() => setTab('oferta')} />}
              {tab === 'oferta' && <TiendaOferta onDone={() => setTab('tienda')} />}
            </View>
            <View style={st.nav} accessibilityRole="tablist">
              <NavItem label="Mi calle" on={tab === 'vecino'} onPress={() => setTab('vecino')} />
              <NavItem label="Mi tienda" on={tab === 'tienda'} onPress={() => setTab('tienda')} />
              <NavItem label="Ofertas" on={tab === 'oferta'} onPress={() => setTab('oferta')} />
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function NavItem({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={onPress} style={[st.navItem, on && st.navOn]}>
      <Text style={[st.navText, on && { color: colors.bg, fontWeight: '800' }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  demo: { textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.muted, paddingVertical: 4, backgroundColor: colors.cream },
  nav: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 8 },
  navItem: { flex: 1, minHeight: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  navOn: { backgroundColor: colors.ink },
  navText: { fontSize: 14, fontWeight: '600', color: colors.ink },
});
