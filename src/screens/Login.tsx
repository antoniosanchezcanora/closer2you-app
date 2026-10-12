import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Segment, T } from '../components/ui';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

// Entrada con correo y contraseña.
// Pasaremos a código por correo cuando haya un servidor de correo propio (SMTP):
// sin él, Supabase no deja personalizar el correo y solo manda un enlace.
export default function Login() {
  const [mode, setMode] = useState<'crear' | 'entrar'>('crear');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'crear') {
        const { data, error } = await supabase!.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Revisa tu correo', 'Te hemos mandado un enlace para confirmar la cuenta. Después vuelve y entra.');
          setMode('entrar');
          return;
        }
        // Si no hay que confirmar el correo, el perfil se crea ya. Si no, la app lo pide al entrar.
        await supabase!.from('profiles').upsert({ id: data.user!.id, display_name: name.trim(), street: 'General Lacy' }, { onConflict: 'id', ignoreDuplicates: true });
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e: any) {
      Alert.alert('No se ha podido', e.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = email.includes('@') && password.length >= 8 && (mode === 'entrar' || name.trim().length > 0);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Text style={T.kicker}>PILOTO EN GENERAL LACY, MADRID</Text>
          <Text style={T.title}>Tu barrio,{'\n'}en tu móvil</Text>
          <Text style={[T.body, { color: '#3D434A' }]}>Compra en las tiendas de tu calle, conoce a tus vecinos y cuidaos entre vosotros.</Text>
        </View>
        <View style={st.points}>
          <Point text="Solo comercio local: sin cadenas ni franquicias" />
          <Point text="Vecinos verificados por una tienda del barrio" />
          <Point text="Sin pagos en la app: pagas a la tienda" />
        </View>
        <Segment items={[{ id: 'crear', label: 'Crear cuenta' }, { id: 'entrar', label: 'Ya tengo cuenta' }]} value={mode} onChange={setMode} />
        {mode === 'crear' && (
          <TextInput value={name} onChangeText={setName} placeholder="Tu nombre (como te conocen en el barrio)" accessibilityLabel="Nombre" style={st.input} maxLength={40} />
        )}
        <TextInput value={email} onChangeText={setEmail} placeholder="Tu correo" keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Correo" style={st.input} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Contraseña (mínimo 8)" secureTextEntry autoCapitalize="none" accessibilityLabel="Contraseña" style={st.input} />
        <Button label={mode === 'crear' ? 'Crear cuenta' : 'Entrar'} busy={busy} disabled={!ready} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Point({ text }: { text: string }) {
  return (
    <View style={st.point}>
      <View style={st.tick}><Text style={st.tickText}>✓</Text></View>
      <Text style={[T.body, { flex: 1, fontSize: 15 }]}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, padding: 24, gap: 14, justifyContent: 'center' },
  points: { gap: 10 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tick: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  tickText: { color: colors.green, fontWeight: '700', fontSize: 14 },
  input: { minHeight: 50, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 14, fontSize: 16, color: colors.ink, borderWidth: 1, borderColor: '#D5D9DE' },
});
