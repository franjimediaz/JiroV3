import { SeedNode } from "@repo/types";
import { customersSeed } from "./customersSeed";
import { pySeed } from "./pySeed";
import { systemSeed } from "./systemSeed";





export const MODULOS_SEED: SeedNode[] = [

  ...customersSeed,
  ...pySeed,
  ...systemSeed,


];