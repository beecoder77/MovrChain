type RewardBannerProps = {
  amount: string;
  label: string;
};

export function RewardBanner({ amount, label }: RewardBannerProps) {
  return (
    <div className="ds-reward-banner" role="status">
      <div className="ds-reward-banner__amount">{amount}</div>
      <div className="ds-reward-banner__label">{label}</div>
    </div>
  );
}
