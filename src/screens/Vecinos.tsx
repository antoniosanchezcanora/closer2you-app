import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Note, T } from '../components/ui';
import type { Me } from '../lib/types';
import { colors } from '../theme';

// Pestaña Vecinos. Pide y ofrece, Mi gente y cuidado son de la Fase 2: solo para cuentas de prueba
// hasta que pasen la revisión de seguridad.
export default function Vecinos({ me, children }: { me: Me | null; children?: React.ReactNode }) {
  if (!me?.fase2) {
    return (
      <ScrollView contentContainerStyle={st.wrap}>
        <Text style={T.title}>Vecinos</Text>
        <Card style={{ gap: 8 }}>
          <Text style={T.h2}>Llega en la Fase 2</Text>
          <Text style={[T.body, { color: '#3D434A' }]}>Pedir y ofrecer favores, tu gente de confianza y cuidaros entre vosotros. Lo abrimos cuando el barrio tenga sus tiendas y tras una revisión de seguridad.</Text>
        </Card>
        <Note>Mientras tanto, la agenda del barrio está en Mi calle.</Note>
      </ScrollView>
    );
  }
  return <View style={{ flex: 1 }}>{children}</View>;
}

const st = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  // reservado para la pestaña completa
  pad: { backgroundColor: colors.bg },
});
