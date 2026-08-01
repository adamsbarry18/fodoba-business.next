
export type LandedCostInput = {
  purchasePrice: number;
  transportFees: number;
  customsDutyPercentage: number;
  otherFees: number;
  exchangeRateToTargetCurrency: number;
};

export type LandedCostOutput = {
  totalLandedCostInOriginalCurrency: number;
  totalLandedCostInTargetCurrency: number;
  costBreakdown: {
    purchasePrice: number;
    transportFees: number;
    customsDuty: number;
    otherFees: number;
  };
  exchangeRateUsed: number;
};

export function calculateLandedCost(input: LandedCostInput): LandedCostOutput {
  const customsDuty = (input.purchasePrice * input.customsDutyPercentage) / 100;
  const totalLandedCostInOriginalCurrency = 
    input.purchasePrice + input.transportFees + customsDuty + input.otherFees;
  
  const totalLandedCostInTargetCurrency = 
    totalLandedCostInOriginalCurrency * input.exchangeRateToTargetCurrency;

  return {
    totalLandedCostInOriginalCurrency,
    totalLandedCostInTargetCurrency,
    costBreakdown: {
      purchasePrice: input.purchasePrice,
      transportFees: input.transportFees,
      customsDuty,
      otherFees: input.otherFees,
    },
    exchangeRateUsed: input.exchangeRateToTargetCurrency,
  };
}
