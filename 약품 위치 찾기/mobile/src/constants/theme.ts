// 병원 브랜드 컬러 팔레트
export const COLORS = {
  primary: '#E8843C',
  secondary: '#8C7A6B',
  accent: '#A9B5C0',
  subAccent: '#B8A99A',
  warning: '#E8843C',
  background: '#F5F5F0',
  cardBackground: '#FFFFFF',
  textPrimary: '#3D3833',
  textSecondary: '#8C7A6B',
  success: '#06D6A0',
  error: '#EF476F',
  overlay: 'rgba(0, 0, 0, 0.5)',
  scanOverlayCategory: 'rgba(169, 181, 192, 0.35)',
  scanOverlayName: 'rgba(232, 132, 60, 0.35)',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const RADIUS = {
  sm: 6,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const FONT = {
  family: 'NotoSansKR',
  size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 },
  weight: { regular: '400', medium: '500', bold: '700' },
} as const;

// 라벨 ROI 비율 (0~1)
export const LABEL_ROI = {
  category: { top: 0, left: 0, width: 0.35, height: 0.2 },
  oralName: { top: 0.7, left: 0, width: 1, height: 0.3 },
  injectionName: { top: 0.3, left: 0, width: 1, height: 0.4 },
} as const;
