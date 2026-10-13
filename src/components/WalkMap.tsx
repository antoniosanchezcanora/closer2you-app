import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors } from '../theme';

export type MapPoint = { id: string; lat: number; lng: number; name: string; color: string; trail?: { lat: number; lng: number }[] };

// Mapa de «Vuelvo a casa». En iPhone usa Apple Maps y en Android Google Maps (en Expo Go no hace falta clave).
export function WalkMap({ points, height = 220 }: { points: MapPoint[]; height?: number }) {
  const ref = useRef<MapView>(null);
  const key = points.map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (!points.length) return;
    const coords = points.flatMap((p) => [{ latitude: p.lat, longitude: p.lng }, ...(p.trail ?? []).map((t) => ({ latitude: t.lat, longitude: t.lng }))]);
    if (coords.length === 1) ref.current?.animateToRegion({ ...coords[0], latitudeDelta: 0.005, longitudeDelta: 0.005 }, 500);
    else ref.current?.fitToCoordinates(coords, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
    // Solo cuando cambian las posiciones
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!points.length) return null;
  return (
    <View style={[st.box, { height }]}>
      <MapView ref={ref} style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: points[0].lat, longitude: points[0].lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
        showsPointsOfInterests={false} toolbarEnabled={false} pitchEnabled={false} rotateEnabled={false}>
        {points.map((p) => (p.trail && p.trail.length > 1 ? <Polyline key={p.id + 't'} coordinates={p.trail.map((t) => ({ latitude: t.lat, longitude: t.lng }))} strokeColor={p.color} strokeWidth={4} lineDashPattern={[6, 6]} /> : null))}
        {points.map((p) => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={[st.dot, { backgroundColor: p.color }]}><Text style={st.dotT}>{p.name.slice(0, 1).toUpperCase()}</Text></View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const st = StyleSheet.create({
  box: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.line },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.3)' },
  dotT: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});
