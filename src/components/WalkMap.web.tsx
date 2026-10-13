import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export type MapPoint = { id: string; lat: number; lng: number; name: string; color: string; trail?: { lat: number; lng: number }[] };

// En la web de demostración no hay mapa nativo: se pinta un recuadro con la posición.
export function WalkMap({ points, height = 220 }: { points: MapPoint[]; height?: number }) {
  if (!points.length) return null;
  return (
    <View style={[st.box, { height }]}>
      {points.map((p) => <Text key={p.id} style={st.t}>{p.name}: {p.lat.toFixed(4)}, {p.lng.toFixed(4)}</Text>)}
      <Text style={[st.t, { color: colors.muted }]}>El mapa se ve en el móvil</Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { borderRadius: 14, backgroundColor: '#E3E8E4', alignItems: 'center', justifyContent: 'center', gap: 4 },
  t: { fontSize: 13, color: colors.ink },
});
