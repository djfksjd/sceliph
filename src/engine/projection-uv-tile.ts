/** Native gear extrusion UVs project local meter coordinates onto axes.
 * A tile is a projection-axis interval before part scale, not surface arc length.
 * Keep the legacy UV generator and use its existing declared scalar operation.
 */
export function projectionUvScalarForTileMm(tileMm:number):number{
 if(!Number.isFinite(tileMm)||tileMm<1||tileMm>1_000_000)throw new Error('Local projection UV tile must be 1..1000000 mm.');
 return 1000/tileMm;
}
