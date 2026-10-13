import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button, Segment, T } from './src/components/ui';
import { repo } from './src/lib/repo';
import { supabase } from './src/lib/supabase';
import type { Conversation, Me, Shop, ShopThread } from './src/lib/types';
import AltaTienda from './src/screens/AltaTienda';
import Avisos from './src/screens/Avisos';
import Login from './src/screens/Login';
import Perfil from './src/screens/Perfil';
import Profesionales, { MiServicio } from './src/screens/Profesionales';
import TiendaAjustes from './src/screens/TiendaAjustes';
import TiendaHoy from './src/screens/TiendaHoy';
import TiendaMenu from './src/screens/TiendaMenu';
import TiendaOferta from './src/screens/TiendaOferta';
import Tiendas from './src/screens/Tiendas';
import VecinoHoy from './src/screens/VecinoHoy';
import Mensajes from './src/screens/Mensajes';
import TiendaMensajes from './src/screens/TiendaMensajes';
import Vecinos, { LoMio } from './src/screens/Vecinos';
import Emergencias from './src/screens/Emergencias';
import { colors } from './src/theme';

// Modo vecino: Mi calle, Vecinos, Mensajes, Perfil (el directorio de tiendas se abre desde La plaza).
// Modo tienda (se abre desde Perfil): Reservas, Publicar, Mensajes, Ajustes.
type Tab = 'calle' | 'tiendas' | 'vecinos' | 'mensajes' | 'perfil' | 'avisos' | 'servicio' | 'alta' | 'lomio' | 'emergencias' | 'tienda' | 'oferta' | 'tmensajes' | 'ajustes';

export default function App() {
  const [tab, setTab] = useState<Tab>('calle');
  const [signedIn, setSignedIn] = useState(repo.mode === 'demo');
  // undefined = cargando; null = aún no ha dicho cómo se llama
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [myShop, setMyShop] = useState<Shop | null>(null);
  const [openShop, setOpenShop] = useState<string | null>(null);
  const [publish, setPublish] = useState<'menu' | 'oferta'>('menu');
  const [donde, setDonde] = useState<'comercios' | 'pros'>('comercios');
  const [chatConv, setChatConv] = useState<Conversation | null>(null);
  const [chatThread, setChatThread] = useState<ShopThread | null>(null);
  const [shopMode, setShopMode] = useState(false);
  const [unread, setUnread] = useState(0);
  const hasShop = !!myShop;
  const fase2 = !!me?.fase2 && !!me?.verified;

  const refreshUnread = useCallback(async () => {
    try { setUnread((await repo.notices()).filter((n) => !n.read_at).length); } catch { /* sin avisos no pasa nada */ }
  }, []);

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
      refreshUnread();
    } catch (e: any) {
      setMe(null);
      Alert.alert('No se ha podido cargar tu perfil', e.message);
    }
  }, [refreshUnread]);

  useEffect(() => {
    if (signedIn) loadMe();
    else { setMe(undefined); setMyShop(null); setTab('calle'); setOpenShop(null); setShopMode(false); setUnread(0); }
  }, [signedIn, loadMe]);

  // Los avisos nuevos llegan al momento mientras la app está abierta.
  useEffect(() => {
    if (!supabase || !signedIn) return;
    const ch = supabase.channel('avisos').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => refreshUnread()).subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [signedIn, refreshUnread]);

  // Mientras Stoop está abierto, tu gente te ve «conectado» (solo quien está en tu círculo).
  useEffect(() => {
    if (!signedIn || !fase2) return;
    const beat = () => { if (AppState.currentState === 'active') repo.touchPresence().catch(() => {}); };
    beat();
    const t = setInterval(beat, 60000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') beat(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [signedIn, fase2]);

  const openChatWith = async (userId: string) => {
    try { setChatConv(await repo.openDirectChat(userId)); setTab('mensajes'); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
  };
  const openConv = (c: Conversation) => { setChatConv(c); setTab('mensajes'); };
  const writeShop = async (shopId: string) => {
    try { setChatThread(await repo.openShopChat(shopId)); setTab('mensajes'); }
    catch (e: any) { Alert.alert('No se ha podido', e.message); }
  };
  const consumed = useCallback(() => { setChatConv(null); setChatThread(null); }, []);

  const signOut = () => { repo.signOut().catch((e: any) => Alert.alert('Error', e.message)); };
  const go = (t: Tab) => { setTab(t); if (t === 'tiendas') setOpenShop(null); };

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
              {!shopMode && tab === 'calle' && <VecinoHoy me={me ?? null} myShop={myShop} unread={unread} onChatWith={openChatWith} onVerified={loadMe} onAvisos={() => go('avisos')} onOpenShop={(id) => { setOpenShop(id); setTab('tiendas'); }} onDirectory={() => go('tiendas')} />}
              {!shopMode && tab === 'tiendas' && (
                fase2 && !openShop ? (
                  <View style={{ flex: 1 }}>
                    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
                      <View style={{ flexDirection: 'row' }}><Button small label="‹ Mi calle" tone="soft" onPress={() => go('calle')} /></View>
                      <Segment items={[{ id: 'comercios', label: 'Comercios' }, { id: 'pros', label: 'Profesionales' }]} value={donde} onChange={setDonde} />
                    </View>
                    {donde === 'comercios' ? <Tiendas verified={!!me?.verified} openShopId={openShop} onOpenShop={setOpenShop} onCloseShop={() => setOpenShop(null)} onWrite={writeShop} /> : <Profesionales />}
                  </View>
                ) : <Tiendas verified={!!me?.verified} openShopId={openShop} onOpenShop={setOpenShop} onCloseShop={() => (openShop ? setOpenShop(null) : go('calle'))} onWrite={writeShop} />
              )}
              {!shopMode && tab === 'vecinos' && <Vecinos me={me ?? null} onOpenChat={openConv} />}
              {!shopMode && tab === 'mensajes' && me && <Mensajes me={me} openConv={chatConv} openThread={chatThread} onConsumed={consumed} />}
              {!shopMode && tab === 'lomio' && me && (
                <View style={{ flex: 1 }}>
                  <View style={{ paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row' }}><Button small label="‹ Perfil" tone="soft" onPress={() => setTab('perfil')} /></View>
                  <LoMio me={me} />
                </View>
              )}
              {!shopMode && tab === 'emergencias' && me && (
                <View style={{ flex: 1 }}>
                  <View style={{ paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row' }}><Button small label="‹ Perfil" tone="soft" onPress={() => setTab('perfil')} /></View>
                  <Emergencias />
                </View>
              )}
              {!shopMode && tab === 'perfil' && <Perfil me={me ?? null} shop={myShop} unread={unread} onAvisos={() => go('avisos')} onShopMode={() => { setShopMode(true); setTab('tienda'); }} onServicio={fase2 ? () => setTab('servicio') : undefined} onAlta={() => setTab('alta')} onLoMio={fase2 ? () => setTab('lomio') : undefined} onEmergencias={fase2 ? () => setTab('emergencias') : undefined} onSignOut={signOut} />}
              {!shopMode && tab === 'alta' && <AltaTienda onBack={() => setTab('perfil')} onDone={() => { loadMe(); setTab('perfil'); }} />}
              {!shopMode && tab === 'servicio' && <MiServicio onBack={() => setTab('perfil')} />}
              {!shopMode && tab === 'avisos' && <Avisos onBack={() => go('calle')} onRead={() => setUnread(0)} />}
              {shopMode && tab === 'tienda' && hasShop && <TiendaHoy onNewOffer={() => setTab('oferta')} onSettings={() => setTab('ajustes')} onShopChange={loadMe} />}
              {shopMode && tab === 'tmensajes' && hasShop && myShop && me && <TiendaMensajes me={me} shop={myShop} />}
              {shopMode && tab === 'ajustes' && hasShop && <TiendaAjustes onDone={() => { loadMe(); setTab('tienda'); }} />}
              {shopMode && tab === 'oferta' && hasShop && myShop && (
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
            {shopMode ? (
              <View style={st.nav} accessibilityRole="tablist">
                <NavItem label="Reservas" icon="mitienda" on={tab === 'tienda'} onPress={() => setTab('tienda')} color={myShop?.tipo === 'restaurante' ? colors.wine : colors.green} />
                <NavItem label="Publicar" icon="publicar" on={tab === 'oferta'} onPress={() => setTab('oferta')} color={myShop?.tipo === 'restaurante' ? colors.wine : colors.green} />
                <NavItem label="Mensajes" icon="mensajes" on={tab === 'tmensajes'} onPress={() => setTab('tmensajes')} color={myShop?.tipo === 'restaurante' ? colors.wine : colors.green} />
                <NavItem label="Ajustes" icon="ajustes" on={tab === 'ajustes'} onPress={() => setTab('ajustes')} color={myShop?.tipo === 'restaurante' ? colors.wine : colors.green} />
                <NavItem label="Modo vecino" icon="salir" on={false} onPress={() => { setShopMode(false); setTab('perfil'); }} />
              </View>
            ) : (
              <View style={st.nav} accessibilityRole="tablist">
                <NavItem label="Mi calle" icon="calle" on={tab === 'calle' || tab === 'avisos' || tab === 'tiendas'} onPress={() => go('calle')} />
                <NavItem label="Vecinos" icon="vecinos" on={tab === 'vecinos'} onPress={() => go('vecinos')} />
                <NavItem label="Mensajes" icon="mensajes" on={tab === 'mensajes'} onPress={() => go('mensajes')} />
                <NavItem label="Perfil" icon="perfil" on={tab === 'perfil' || tab === 'servicio' || tab === 'alta' || tab === 'lomio' || tab === 'emergencias'} onPress={() => go('perfil')} badge={unread} />
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

const ICONS = {
  calle: 'M4 11 L12 4 L20 11 V20 H4 Z M10 20 V15 H14 V20',
  tiendas: 'M4 9 L5.5 4.5 H18.5 L20 9 Z M5 9 V20 H19 V9 M10 20 V15 H14 V20',
  mitienda: 'M6 8.5 H18 L17 20 H7 Z M9 8.5 V7 A3 3 0 0 1 15 7 V8.5',
  publicar: 'M4.5 12 L12 4.5 H19.5 V12 L12 19.5 Z M15.5 8.5 h.01',
  vecinos: 'M9 11 A3 3 0 1 0 9 5 A3 3 0 1 0 9 11 Z M3.5 20 Q3.5 14 9 14 Q14.5 14 14.5 20 M16 11 A2.4 2.4 0 1 0 16 6.2 M17 14 Q20.5 14.5 20.5 19',
  perfil: 'M12 12 A4 4 0 1 0 12 4 A4 4 0 1 0 12 12 Z M4.5 20.5 Q4.5 14.5 12 14.5 Q19.5 14.5 19.5 20.5',
  ajustes: 'M5 7 H19 M5 12 H19 M5 17 H19 M9 5 V9 M15 10 V14 M11 15 V19',
  salir: 'M14 5 H19 V19 H14 M10 8 L6 12 L10 16 M6 12 H16',
  mensajes: 'M4 6 H20 V16 H11 L7 19.5 V16 H4 Z M8 10 H16 M8 12.8 H13',
} as const;

function NavItem({ label, icon, on, onPress, color = colors.green, badge = 0 }: { label: string; icon: keyof typeof ICONS; on: boolean; onPress: () => void; color?: string; badge?: number }) {
  const c = on ? color : colors.faint;
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={badge ? `${label}, ${badge} avisos sin leer` : label} accessibilityState={{ selected: on }} onPress={onPress} style={st.navItem}>
      <View>
        <Svg width={24} height={24} viewBox="0 0 24 24"><Path d={ICONS[icon]} fill="none" stroke={c} strokeWidth={1.9} strokeLinejoin="round" strokeLinecap="round" /></Svg>
        {badge > 0 && <View style={st.badge} />}
      </View>
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
  badge: { position: 'absolute', right: -3, top: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.card },
  setup: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
});
