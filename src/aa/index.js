export const aaConfig=()=>({bundler:import.meta.env.VITE_BUNDLER_URL||'',paymaster:import.meta.env.VITE_PAYMASTER_URL||''});
export const sponsorshipReady=()=>Boolean(aaConfig().bundler&&aaConfig().paymaster);
export function sponsorshipMessage(){return sponsorshipReady()?'ERC-4337 bundler + paymaster configured':'ERC-4337 sponsorship unavailable until a real bundler and paymaster endpoint are configured'}
