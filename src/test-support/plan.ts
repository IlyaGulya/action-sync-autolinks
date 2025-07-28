import { AutolinkOp } from '../plan';

export async function runPlan(
  dryRun: boolean,
  ops: AutolinkOp[],
  deps: { octokit: any; owner: string; repo: string; core: any }
): Promise<number> {
  if (dryRun) {
    const { applyAutolinkPlanDryRun } = await import('../apply');
    return applyAutolinkPlanDryRun(ops, deps.core);
  } else {
    const { applyAutolinkPlan } = await import('../apply');
    return applyAutolinkPlan(deps.octokit, deps.owner, deps.repo, ops, deps.core);
  }
}