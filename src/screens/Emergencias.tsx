import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Initial, Label, Note, T } from '../components/ui';
import { repo } from '../lib/repo';
import type { DiscreetPerson, Person } from '../lib/types';
import { colors } from '../theme';

// Perfil > Personas para emergencias (el aviso discreto).
// El nombre de la pantalla es neutro a propósito: alguien puede mirar el móvil.
export default function Emergencias() {
  const [people, setPeople] = useState<Person[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [forMe, setForMe] = useState<DiscreetPerson[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, mine, me4] = await Promise.all([repo.people(), repo.myDiscreetContacts(), repo.discreetForMe()]);
      setPeople(p.filter((x) => x.status === 'aceptada'));
      setChosen(mine.map((x) => x.id)); setSaved(mine.map((x) => x.id)); setForMe(me4);
    } catch (e: any) { Alert.alert('No se ha podido cargar', e.message); }
  }, []);
  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 2 ? c : [...c, id]));
  const changed = chosen.length !== saved.length || chosen.some((x) => !saved.includes(x));

  const save = () => {
    const names = people.filter((p) => chosen.includes(p.other_id)).map((p) => p.name);
    const doSave = async () => {
      setBusy(true);
      try { await repo.setDiscreetContacts(chosen); await load(); Alert.alert('Guardado'); }
      catch (e: any) { Alert.alert('No se ha podido', e.message); }
      finally { setBusy(false); }
    };
    if (!chosen.length) { doSave(); return; }
    Alert.alert('Antes de guardar', `¿Vive contigo ${names.length === 1 ? names[0] : 'alguna de estas personas'}? Si es así, no la elijas: el aviso tiene que llegar a alguien de fuera de casa.`, [
      { text: 'Revisar', style: 'cancel' },
      { text: 'No vive conmigo, guardar', onPress: doSave },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <Text style={T.title}>Personas para emergencias</Text>
      <Text style={T.body}>Elige como mucho a dos personas de tu gente que no vivan contigo. Si un día mantienes pulsado «Estoy bien» durante 3 segundos, les llega un aviso: «necesita ayuda en casa, llama al 112, no vayas sola a la puerta», con tu ubicación si el móvil ya la tiene.</Text>
      <Card style={{ gap: 6 }}>
        <Text style={T.strong}>En tu móvil no queda nada</Text>
        <Text style={T.small}>Verás lo mismo que al tocar «Estoy bien». No te sale ningún aviso, no aparece en tu historial, tu ventana no cambia y tu gente no recibe ningún «Estoy bien». Solo te llegará un aviso si una de estas personas deja la lista, y con un texto que no dice nada.</Text>
      </Card>

      <Label>Elige hasta dos</Label>
      {people.length === 0 && <Note>Primero añade a alguien a tu gente en Vecinos, Mi gente.</Note>}
      <View style={st.group}>
        {people.map((p, i) => {
          const on = chosen.includes(p.other_id);
          return (
            <Pressable key={p.other_id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(p.other_id)} style={[st.line, i > 0 && st.sep]}>
              <Initial name={p.name} size={40} />
              <Text style={[T.strong, { flex: 1 }]}>{p.name}</Text>
              <View style={[st.check, on && st.checkOn]}>{on && <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>✓</Text>}</View>
            </Pressable>
          );
        })}
      </View>
      {changed && <Button label={busy ? 'Guardando…' : 'Guardar'} disabled={busy} onPress={save} />}
      <Note>Esto no sustituye al 112 ni al 016. Si estás en peligro ahora, llama al 112. El 016 atiende 24 horas, también por WhatsApp en el 600 000 016, y no sale en la factura.</Note>

      {forMe.length > 0 && (
        <>
          <Label>Te han elegido a ti</Label>
          {forMe.map((p) => (
            <Card key={p.id} style={{ gap: 8 }}>
              <Text style={T.body}><Text style={T.strong}>{p.name}</Text> te ha elegido. Si te llega un aviso suyo, llama al 112 y no vayas sola a la puerta.</Text>
              <Button small label="Dejar de recibir sus avisos" tone="ghost" onPress={() => Alert.alert('Dejar de recibir sus avisos', `${p.name} verá que su lista ha cambiado, sin tu nombre.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Dejar', style: 'destructive', onPress: async () => { try { await repo.leaveDiscreet(p.id); load(); } catch (e: any) { Alert.alert('No se ha podido', e.message); } } }])} />
            </Card>
          ))}
        </>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  group: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  sep: { borderTopWidth: 1, borderTopColor: colors.line },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.green, borderColor: colors.green },
});
