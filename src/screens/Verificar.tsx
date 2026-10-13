import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Chip, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { IdCheck, IdMethod, PendingIdCheck } from '../lib/types';
import { colors, hhmm } from '../theme';

const METHOD: Record<IdMethod, { label: string; help: string }> = {
  factura: { label: 'Una factura', help: 'De luz, agua, gas, teléfono o internet, a tu nombre y con la dirección de tu casa, de los últimos tres meses.' },
  dni: { label: 'Mi DNI', help: 'La cara donde sale tu domicilio. Puedes tapar el número y la foto: solo miramos tu nombre y tu dirección.' },
};

async function pickPhoto(camera: boolean): Promise<string | null> {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('Sin permiso', camera ? 'Stoop necesita la cámara para hacer la foto.' : 'Stoop necesita acceso a tus fotos para elegirla.'); return null; }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.9 };
  const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  return r.canceled ? null : r.assets[0].uri;
}

// Para quien no puede pasar por una tienda: verificarse con una factura o con el DNI.
// Lo revisa una persona del equipo de Stoop y la foto se borra al terminar.
export function VerificarDocumento({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<IdMethod>('factura');
  const [check, setCheck] = useState<IdCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setCheck(await repo.myIdCheck()); } catch { /* sin conexión: se ve el botón */ } }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const send = async (camera: boolean) => {
    const uri = await pickPhoto(camera);
    if (!uri) return;
    setBusy(true);
    try { await repo.sendIdCheck(method, uri); await load(); setOpen(false); onChanged?.(); Alert.alert('Enviado', 'Lo revisamos en cuanto podamos y te avisamos. Al terminar borramos la foto.'); }
    catch (e: any) { Alert.alert('No se ha podido enviar', e.message); }
    finally { setBusy(false); }
  };

  if (check?.status === 'pendiente') {
    return (
      <View style={st.box}>
        <Text style={T.strong}>Estamos revisando tu {check.method === 'dni' ? 'DNI' : 'factura'}</Text>
        <Text style={T.small}>Enviado a las {hhmm(check.created_at)}. Te avisamos al terminar y borramos la foto.</Text>
        <Button small label="Retirarla" tone="ghost" onPress={() => Alert.alert('Retirar la foto', 'La borramos ahora y no la revisamos.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Retirar', style: 'destructive', onPress: async () => { try { await repo.cancelIdCheck(check.id); load(); } catch (e: any) { Alert.alert('No se ha podido', e.message); } } }])} />
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {check?.status === 'rechazada' && <Note tint={colors.redSoft} color={colors.red}>{`No hemos podido verificarte${check.reason ? ': ' + check.reason : ''}. Ya hemos borrado la foto. Puedes probar otra vez.`}</Note>}
      {!open ? (
        <Text style={[T.small, { color: '#1F4A37', textDecorationLine: 'underline' }]} onPress={() => setOpen(true)}>¿No puedes pasar por una tienda? Verifícate con una factura o con tu DNI</Text>
      ) : (
        <View style={st.box}>
          <Text style={T.strong}>¿Qué nos enseñas?</Text>
          <View style={st.row}>{(['factura', 'dni'] as IdMethod[]).map((m) => <Chip key={m} label={METHOD[m].label} on={method === m} onPress={() => setMethod(m)} />)}</View>
          <Text style={T.small}>{METHOD[method].help}</Text>
          <View style={st.row}>
            <Button small label={busy ? 'Enviando…' : 'Hacer foto'} disabled={busy} onPress={() => send(true)} style={{ flex: 1 }} />
            <Button small label="Elegir de la galería" tone="soft" disabled={busy} onPress={() => send(false)} style={{ flex: 1 }} />
          </View>
          <Text style={T.small}>La ve solo una persona del equipo de Stoop. Comprobamos tu nombre y que vives en el barrio, y borramos la foto al terminar. No guardamos el número ni la dirección.</Text>
          <Text style={[T.small, { color: colors.muted }]} onPress={() => setOpen(false)}>Cancelar</Text>
        </View>
      )}
    </View>
  );
}

const REASONS = ['No se lee bien', 'No es de este barrio', 'El nombre no coincide', 'La factura es antigua'];

// Perfil > Revisar verificaciones (solo el equipo de Stoop).
export function RevisarVerificaciones() {
  const [items, setItems] = useState<PendingIdCheck[]>([]);
  const [open, setOpen] = useState<PendingIdCheck | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setItems(await repo.pendingIdChecks()); } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); } }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const show = async (c: PendingIdCheck) => {
    setOpen(c); setUrl(null);
    try { setUrl(await repo.idPhotoUrl(c.path)); } catch (e: any) { Alert.alert('No se ha podido abrir la foto', e.message); }
  };
  const review = async (approve: boolean, reason?: string) => {
    if (!open) return;
    setBusy(true);
    try { await repo.reviewIdCheck(open.id, approve, reason); setOpen(null); setUrl(null); await load(); }
    catch (e: any) { Alert.alert('Atención', e.message); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={T.title}>Revisar verificaciones</Text>
      <Note>Comprueba solo dos cosas: que el nombre coincide con el de la cuenta y que la dirección está en el barrio. Al aprobar o rechazar, la foto se borra.</Note>
      {items.length === 0 && <Note>No hay nada pendiente.</Note>}
      {!open && items.map((c) => (
        <Card key={c.id} style={{ gap: 6 }}>
          <View style={[st.row, { justifyContent: 'space-between' }]}>
            <Text style={T.h2}>{c.name}</Text>
            <Badge label={c.method === 'dni' ? 'DNI' : 'Factura'} color={colors.blue} soft={colors.blueSoft} />
          </View>
          <Text style={T.small}>Enviado a las {hhmm(c.created_at)}</Text>
          <Button small label="Ver la foto" onPress={() => show(c)} />
        </Card>
      ))}
      {open && (
        <Card style={{ gap: 10 }}>
          <Text style={T.h2}>{open.name} · {open.method === 'dni' ? 'DNI' : 'Factura'}</Text>
          {url ? <Image source={{ uri: url }} style={st.photo} resizeMode="contain" accessibilityLabel="Foto enviada para verificar" /> : <Text style={T.small}>Cargando la foto…</Text>}
          <Button label="Aprobar: vive en el barrio" disabled={busy} onPress={() => review(true)} />
          <Label>O rechazar porque…</Label>
          <View style={st.row}>{REASONS.map((r) => <Chip key={r} label={r} on={false} onPress={() => review(false, r)} color={colors.red} />)}</View>
          <Text style={[T.small, { color: colors.muted }]} onPress={() => { setOpen(null); setUrl(null); }}>Volver sin decidir</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  box: { gap: 8, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  photo: { width: '100%', height: 420, borderRadius: 12, backgroundColor: '#F1F2F4' },
});
