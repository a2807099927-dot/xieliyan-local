// Samples wallpaper colors and exposes HSL CSS variables.
import { useEffect } from 'react';

/**
 * Smart wallpaper color hook.
 * Samples the wallpaper color and writes HSL variables to :root.
 */
export function useWallpaperColor(imageUrl: string | undefined) {
 useEffect(() => {
 if (!imageUrl || imageUrl === 'none') {
 document.documentElement.style.removeProperty('--wp-surface');
 document.documentElement.style.removeProperty('--wp-accent');
 document.documentElement.style.removeProperty('--wp-text');
 return;
 }

 const img = new Image();
 img.crossOrigin = 'Anonymous';
 img.src = imageUrl;

 img.onload = () => {
 const canvas = document.createElement('canvas');
 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 // 
 canvas.width = 10;
 canvas.height = 10;
 ctx.drawImage(img, 0, 0, 10, 10);
 
 const data = ctx.getImageData(0, 0, 10, 10).data;
 let r = 0, g = 0, b = 0;
 
 // 
 for (let i = 0; i < data.length; i += 4) {
 r += data[i];
 g += data[i + 1];
 b += data[i + 2];
 }
 
 const count = data.length / 4;
 r = Math.floor(r / count);
 g = Math.floor(g / count);
 b = Math.floor(b / count);

 // HSL 
 const [h, s, l] = rgbToHsl(r, g, b);

 // 
 // 1. Surface (): ()
 const surfaceL = l > 0.5 ? 96 : 12;
 const surfaceS = Math.min(s, 15); // 降低饱和度避免太刺眼
 
 // 2. Accent (): 
 const accentS = Math.max(s, 60);
 const accentL = Math.max(l, 50);

 // 3. Text (): 
 const textL = surfaceL > 50 ? 10 : 95;

 const root = document.documentElement;
 root.style.setProperty('--wp-surface', `hsl(${h}, ${surfaceS}%, ${surfaceL}%)`);
 root.style.setProperty('--wp-accent', `hsl(${h}, ${accentS}%, ${accentL}%)`);
 root.style.setProperty('--wp-text', `hsl(${h}, 5%, ${textL}%)`);
 };
 }, [imageUrl]);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
 r /= 255; g /= 255; b /= 255;
 const max = Math.max(r, g, b), min = Math.min(r, g, b);
 let h = 0, s = 0, l = (max + min) / 2;

 if (max !== min) {
 const d = max - min;
 s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
 switch (max) {
 case r: h = (g - b) / d + (g < b ? 6 : 0); break;
 case g: h = (b - r) / d + 2; break;
 case b: h = (r - g) / d + 4; break;
 }
 h /= 6;
 }

 return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}
