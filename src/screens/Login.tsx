import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, T } from '../components/ui';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

// Entrada con código por correo: sin contraseñas que recordar.
export default function Login() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) Alert.alert('No se ha podido enviar', error.message);
    else setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    const { data, error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: otp.trim(), type: 'email' });
    if (!error && data.user && name.trim()) {
      // crea el perfil la primera vez; si ya existe no hace nada
      await supabase!.from('profiles').upsert({ id: data.user.id, display_name: name.trim(), street: 'General Lacy' }, { onConflict: 'id', ignoreDuplicates: true });
    }
    setBusy(false);
    if (error) Alert.alert('Código incorrecto', error.message);
  };

  return (
    <View style={st.wrap}>
      <Text style={T.h1}>Volver al barrio</Text>
      <Text style={T.small}>Zona piloto: General Lacy y sus calles de alrededor.</Text>
      {!sent ? (
        <>
          <TextInput value={name} onChangeText={setName} placeholder="Tu nombre (como te conocen en el barrio)" accessibilityLabel="Nombre" style={st.input} maxLength={40} />
          <TextInput value={email} onChangeText={setEmail} placeholder="Tu correo" keyboardType="email-address" autoCapitalize="none" accessibilityLabel="Correo" style={st.input} />
          <Button label="Enviarme el código" busy={busy} disabled={!email.includes('@')} onPress={send} />
        </>
      ) : (
        <>
          <Text style={T.body}>Te hemos mandado un código a {email}. Escríbelo aquí.</Text>
          <TextInput value={otp} onChangeText={setOtp} placeholder="Código" keyboardType="number-pad" accessibilityLabel="Código" style={st.input} />
          <Button label="Entrar" busy={busy} disabled={otp.length < 6} onPress={verify} />
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 16, color: colors.ink },
});
