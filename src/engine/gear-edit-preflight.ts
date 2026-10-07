import {validateSpurGear,SpurGearValidationError,type SpurGearIssue,type SpurGearGeometry} from './spur-gear';
import {gearChamferMaximum,validateGearChamferAmount} from './gear-chamfer';

export type GearEditPreflight = {
  valid: boolean;
  maximumChamferMm: number | null;
  reason: string | null;
  issue: SpurGearIssue | null;
};
/** Non-mutating draft check. Final Apply still runs editPart and actual topology validation. */
export function gearEditPreflight(geometry: SpurGearGeometry, chamferMm: number): GearEditPreflight {
  let maximumChamferMm: number | null = null;
  try {
    validateSpurGear(geometry);
    maximumChamferMm = gearChamferMaximum(geometry);
    validateGearChamferAmount(geometry, chamferMm);
    return {valid: true, maximumChamferMm, reason: null, issue: null};
  } catch (error) {
    return {valid: false, maximumChamferMm, reason: error instanceof Error ? error.message : 'Invalid gear parameters', issue: error instanceof SpurGearValidationError ? {...error.issue} : null};
  }
}
