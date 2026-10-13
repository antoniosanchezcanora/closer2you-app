import React, { useMemo } from 'react';
import { Image, View, ViewStyle } from 'react-native';
import Svg, { G, Polygon, Rect, Text as SvgText, SvgXml } from 'react-native-svg';
import { CALLE_SVG, CALLE_VENTANAS, FACHADAS } from '../lib/art';
import type { Fachada as FachadaKind, Shop } from '../lib/types';

export type LitWindow = { id: string; name: string; awake: boolean; online: boolean };

// A cada persona le toca siempre la misma ventana (no es su casa real: es un sitio fijo en el dibujo).
function windowFor(people: LitWindow[]) {
  const used = new Set<number>();
  return people.map((p) => {
    let h = 0;
    for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let i = h % CALLE_VENTANAS.length;
    while (used.has(i) && used.size < CALLE_VENTANAS.length) i = (i + 1) % CALLE_VENTANAS.length;
    used.add(i);
    return { p, w: CALLE_VENTANAS[i] };
  });
}

// La calle dibujada en perspectiva, como en el diseño (sin rótulos: las ofertas van en tarjetas debajo).
// Las ventanas de tu gente conectada o despierta se encienden y se pueden tocar para escribirles.
export function Calle({ width, style, lit = [], onPressWindow }: { width: number; style?: ViewStyle; lit?: LitWindow[]; onPressWindow?: (id: string) => void }) {
  const height = Math.round((width * 406) / 480);
  return (
    <View style={style}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SvgXml xml={CALLE_SVG} width={width} height={height} />
      </View>
      {lit.length > 0 && (
        <Svg width={width} height={height} viewBox="20 -78 480 406" style={{ position: 'absolute', left: 0, top: 0 }}>
          {windowFor(lit).map(({ p, w }) => {
            const glow = p.awake ? '#FFC24A' : '#FFE08A';
            const label = p.name.replace(/ \(prueba\)$/, '').slice(0, 12);
            const lw = label.length * 5.6 + 14;
            return (
              <G key={p.id} onPress={() => onPressWindow?.(p.id)} accessibilityLabel={`${p.name}, ${p.awake ? 'despierto' : 'conectado'}. Toca para escribir.`}>
                <Polygon points={w.pts} fill={glow} opacity={0.35} transform={`translate(0 0) scale(1)`} stroke={glow} strokeWidth={6} strokeOpacity={0.35} />
                <Polygon points={w.pts} fill={glow} />
                <Rect x={w.cx - lw / 2} y={w.top - 18} width={lw} height={14} rx={7} fill="#1F2328" opacity={0.85} />
                <SvgText x={w.cx} y={w.top - 8} textAnchor="middle" fontSize={9} fontWeight="700" fill="#FFFFFF">{label}</SvgText>
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

// Fachada de la tienda con su nombre en el rótulo.
export function Fachada({ kind, name, width, height, style }: { kind: FachadaKind; name: string; width: number; height?: number; style?: ViewStyle }) {
  const xml = useMemo(() => {
    const base = FACHADAS[kind === 'otra' ? 'libros' : kind];
    const label = name.toUpperCase().slice(0, 26);
    // El rótulo mide unos 320 px: si el nombre es largo, se encoge la letra.
    const size = Math.max(9, Math.min(16, Math.floor(300 / (label.length * 0.82))));
    return base
      .replace('@@NAME@@', label.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
      .replace('font-size="16" letter-spacing="2"', `font-size="${size}" letter-spacing="${size > 12 ? 2 : 1}"`);
  }, [kind, name]);
  const h = height ?? Math.round((width * 200) / 358);
  return (
    <View style={[{ width, height: h, overflow: 'hidden' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={width} height={Math.max(h, Math.round((width * 200) / 358))} preserveAspectRatio="xMidYMin slice" />
    </View>
  );
}

// Imagen de la tienda: su foto si la ha subido y la quiere usar; si no, el dibujo de Stoop.
export function ShopImage({ shop, width, height, style }: { shop: Pick<Shop, 'fachada' | 'name' | 'photo_url' | 'use_photo'>; width: number; height?: number; style?: ViewStyle }) {
  const h = height ?? Math.round((width * 200) / 358);
  if (shop.use_photo && shop.photo_url) {
    return <Image source={{ uri: shop.photo_url }} style={[{ width, height: h, overflow: 'hidden' }, style as any]} resizeMode="cover" accessibilityLabel={`Fachada de ${shop.name}`} />;
  }
  return <Fachada kind={shop.fachada} name={shop.name} width={width} height={height} style={style} />;
}
