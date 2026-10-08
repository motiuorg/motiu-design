// src/lib/voronoi-core.d.mts
export type Point = [number, number];
export interface Transform {
  scale: number; stretchX: number; stretchY: number;
  rotation: number; offsetX: number; offsetY: number;
}
export interface CellOpts {
  sites: Point[];
  transform: Transform | null;
  viewBox: { w: number; h: number };
  pad: { x: number; y: number };
  cornerRadius?: number;
}
export function transformPoint(p: Point, t: Transform, center: Point): Point;
export function roundPolygonPath(points: Point[], radius: number): string;
export function computeCellPolygons(opts: CellOpts): Array<Point[] | null>;
export function computeCellPaths(opts: CellOpts): Array<string | null>;
