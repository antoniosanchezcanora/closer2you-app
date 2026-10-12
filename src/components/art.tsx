import React, { useMemo } from 'react';
import { View, ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { CALLE_SVG, FACHADAS } from '../lib/art';
import type { Fachada as FachadaKind } from '../lib/types';

// La calle dibujada en perspectiva, como en el diseño (sin rótulos: las ofertas van en tarjetas debajo).
export function Calle({ width, style }: { width: number; style?: ViewStyle }) {
  const height = Math.round((width * 406) / 480);
  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={CALLE_SVG} width={width} height={height} />
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
