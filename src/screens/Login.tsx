import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Chip, T } from '../components/ui';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

// Entrada con correo y contraseña.
// Pasaremos a código por correo cuando haya un servidor de correo propio (SMTP):
// sin él, Supabase no deja personalizar el correo y solo manda un enlace.
export default function Login() {
  const [mode, setMode] = useState<'entrar' | 'crear'>('crear');
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
        const { error: pe } = await supabase!.from('profiles').insert({ id: data.user!.id, display_name: name.trim(), street: 'General Lacy' });
        if (pe) throw pe;
      } else {
        const { data, error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // si confirmó por correo, el perfil se crea en la primera entrada
        if (name.trim()) {
          await supabase!.from('profiles').upsert({ id: data.user.id, display_name: name.trim(), street: 'General Lacy' }, { onConflict: 'id', ignoreDuplicates: true });
        }
      }
    } catch (e: any) {
      Alert.alert('No se ha podido', e.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = email.includes('@') && password.length >= 8 && (mode === 'entrar' || name.trim().length > 0);

  return (
    <View style={st.wrap}>
      <Text style={T.h1}>Volver al barrio</Text>
      <Text style={T.small}>Zona piloto: General Lacy y sus calles de alrededor.</Text>
      <View style={st.row}>
        <Chip label="Crear cuenta" on={mode === 'crear'} onPress={() => setMode('crear')} />
        <Chip label="Ya tengo cuenta" on={mode === 'entrar'} onPress={() => setMode('entrar')} />
      </View>
      {mode === 'crear' && (
        <TextInput value={name} onChangeText={setName} placeholder="Tu nombre (como te conocen en el barrio)" accessibilityLabel="Nombre" style={st.input} maxLength={40} />
      )}
      <TextInput value={email} onChangeText={setEmail} placeholder="Tu correo" keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel="Correo" style={st.input} />
      <TextInput value={password} onChangeText={setPassword} placeholder="Contraseña (mínimo 8)" secureTextEntry autoCapitalize="none" accessibilityLabel="Contraseña" style={st.input} />
      <Button label={mode === 'crear' ? 'Crear cuenta' : 'Entrar'} busy={busy} disabled={!ready} onPress={submit} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink },
});
