import { ENDPOINTS } from "@pontis/api-types";
import type { FastifyInstance } from "fastify";
import { AppError, notFound } from "../errors.ts";
import { LendingRefusal, type LendingService } from "../lending/service.ts";

const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");
const amount = (value: string) => BigInt(value);
const renderEligibility = (value: Awaited<ReturnType<LendingService["eligibilityFor"]>>) => ({
  eligible: value.eligible,
  reasons: value.reasons,
  asset: value.asset,
  priceObservedAt: value.price?.observedAt.toISOString() ?? null,
});
const renderCapacity = (value: Awaited<ReturnType<LendingService["borrowingCapacity"]>>) => ({
  collateralValue: value.collateralValue.toString(),
  maximumBorrowCapacity: value.maximumBorrowCapacity.toString(),
  availableBorrowAmount: value.availableBorrowAmount.toString(),
  outstandingDebt: value.outstandingDebt.toString(),
  currentLtvWad: value.currentLtvWad.toString(),
  liquidationThresholdWad: value.liquidationThresholdWad.toString(),
  healthFactorWad: value.healthFactorWad?.toString() ?? null,
  marketLiquidity: value.marketLiquidity.toString(),
});
const renderPlan = (value: Awaited<ReturnType<LendingService["plan"]>>) => ({
  ...value,
  transactions: value.transactions.map((transaction) => ({
    ...transaction,
    value: transaction.value.toString(),
  })),
});

export function registerLendingRoutes(app: FastifyInstance, service: LendingService): void {
  const e = ENDPOINTS;
  const handle = <T>(work: () => Promise<T>) =>
    work().catch((error: unknown) => {
      if (error instanceof LendingRefusal)
        throw new AppError(
          error.code,
          error.code === "NOT_FOUND" ? 404 : error.code === "VALIDATION_ERROR" ? 400 : 422,
          error.message,
        );
      throw error;
    });
  app.get(e.listCollateralAssets.path, async () =>
    e.listCollateralAssets.response.parse({ items: service.listCollateralAssets() }),
  );
  app.get(e.listEligibleWalletAssets.path, async (req) =>
    handle(async () => {
      const { owner } = e.listEligibleWalletAssets.query.parse(req.query);
      const holdings = await service.listEligibleWalletAssets(owner);
      return e.listEligibleWalletAssets.response.parse({
        items: holdings.map((holding) => {
          const asset = service
            .listCollateralAssets()
            .find((candidate) => candidate.id === holding.assetId);
          if (!asset) throw notFound("Collateral asset");
          return { asset, provider: holding.provider, balance: holding.balance.toString() };
        }),
      });
    }),
  );
  app.post(e.checkCollateralEligibility.path, async (req) =>
    handle(async () => {
      const input = e.checkCollateralEligibility.body.parse(req.body);
      return e.checkCollateralEligibility.response.parse(
        renderEligibility(
          await service.eligibilityFor(input.assetId, input.provider, input.chain, input.loanToken),
        ),
      );
    }),
  );
  app.get(e.listLendingMarkets.path, async () =>
    e.listLendingMarkets.response.parse({
      items: (await service.listMarkets()).map((market) => ({
        ...market,
        lltvWad: market.lltvWad.toString(),
        availableLiquidity: market.availableLiquidity.toString(),
      })),
    }),
  );
  app.get(route(e.getBorrowingCapacity.path), async (req) =>
    handle(async () => {
      const { id } = e.getBorrowingCapacity.params.parse(req.params);
      const { owner } = e.getBorrowingCapacity.query.parse(req.query);
      return e.getBorrowingCapacity.response.parse(
        renderCapacity(await service.borrowingCapacity(id, owner)),
      );
    }),
  );
  for (const [endpoint, operation] of [
    [e.planCollateralDeposit, "deposit"],
    [e.planBorrow, "borrow"],
    [e.planRepay, "repay"],
    [e.planCollateralWithdrawal, "withdraw"],
  ] as const) {
    app.post(endpoint.path, async (req) =>
      handle(async () => {
        const input = endpoint.body.parse(req.body);
        return endpoint.response.parse(
          renderPlan(
            await service.plan(operation, input.marketId, input.owner, amount(input.amount)),
          ),
        );
      }),
    );
  }
}
