// 切割地图素材 sprite sheet 为独立 PNG 文件
// 用法: node scripts/slice-map-assets.mjs
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const srcDir = join(import.meta.dirname, '..', '地图素材');
const outDir = join(import.meta.dirname, '..', 'src-tauri', 'resources', 'map-tiles');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// 需要 sharp: npm i sharp --save-dev (或全局)
// 如果没有 sharp，用 Python Pillow 替代
let useSharp = false;
try {
  await import('sharp');
  useSharp = true;
} catch {
  // fallback to python
}

if (!useSharp) {
  // 使用 Python + Pillow 切割
  const pyScript = `
import os, sys
from PIL import Image

src_dir = r'${srcDir.replace(/\\/g, '\\\\')}'
out_dir = r'${outDir.replace(/\\/g, '\\\\')}'
os.makedirs(out_dir, exist_ok=True)

# 第1张：山脉与地形 3x3
img = Image.open(os.path.join(src_dir, '山脉与地形.png'))
w, h = img.size
cw, ch = w // 3, h // 3
names1 = ['mountain_snow_1', 'mountain_snow_2', 'mountain_snow_3',
           'hill_green', 'hill_rock', 'desert_1',
           'desert_2', 'snow_cloud', 'grassland']
for i, name in enumerate(names1):
    row, col = i // 3, i % 3
    box = (col * cw, row * ch, (col+1) * cw, (row+1) * ch)
    tile = img.crop(box)
    tile.save(os.path.join(out_dir, f'{name}.png'))
    print(f'  [1] {name}.png ({cw}x{ch})')

# 第2张：森林与植被 3x4
img2 = Image.open(os.path.join(src_dir, '森林与植被.png'))
w2, h2 = img2.size
cw2, ch2 = w2 // 3, h2 // 4
names2 = ['forest_dense_1', 'forest_dense_2', 'forest_dense_3',
           'forest_sparse_1', 'forest_sparse_2', 'forest_sparse_3',
           'bamboo_1', 'dead_tree_1', 'swamp_1',
           'bamboo_2', 'dead_tree_2', 'swamp_2']
for i, name in enumerate(names2):
    row, col = i // 3, i % 3
    box = (col * cw2, row * ch2, (col+1) * cw2, (row+1) * ch2)
    tile = img2.crop(box)
    tile.save(os.path.join(out_dir, f'{name}.png'))
    print(f'  [2] {name}.png ({cw2}x{ch2})')

# 第3张：背景纹理 2x2
img3 = Image.open(os.path.join(src_dir, '深海浅滩沿海.png'))
w3, h3 = img3.size
cw3, ch3 = w3 // 2, h3 // 2
names3 = ['ocean_surface', 'parchment', 'ocean_deep', 'shore_beach']
for i, name in enumerate(names3):
    row, col = i // 2, i % 2
    box = (col * cw3, row * ch3, (col+1) * cw3, (row+1) * ch3)
    tile = img3.crop(box)
    tile.save(os.path.join(out_dir, f'{name}.png'))
    print(f'  [3] {name}.png ({cw3}x{ch3})')

# 第4张：建筑标记 3x3
img4 = Image.open(os.path.join(src_dir, '城池村庄.png'))
w4, h4 = img4.size
cw4, ch4 = w4 // 3, h4 // 3
names4 = ['city_capital_1', 'city_capital_2', 'city_capital_3',
           'city_town_1', 'village_1', 'village_2',
           'fortress', 'war_banner', 'port']
for i, name in enumerate(names4):
    row, col = i // 3, i % 3
    box = (col * cw4, row * ch4, (col+1) * cw4, (row+1) * ch4)
    tile = img4.crop(box)
    tile.save(os.path.join(out_dir, f'{name}.png'))
    print(f'  [4] {name}.png ({cw4}x{ch4})')

print(f'\\n✅ 切割完成！共 {len(names1)+len(names2)+len(names3)+len(names4)} 个素材 → {out_dir}')
`;

  const pyFile = join(import.meta.dirname, '_slice_tmp.py');
  const { writeFileSync, unlinkSync } = await import('fs');
  writeFileSync(pyFile, pyScript, 'utf8');
  try {
    execSync(`python "${pyFile}"`, { stdio: 'inherit' });
  } finally {
    unlinkSync(pyFile);
  }
} else {
  console.log('sharp 模式暂未实现，请安装 Python + Pillow');
}
