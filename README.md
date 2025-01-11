# SimGov, SimStable, and CentralVault

This repository contains the implementation of a decentralized finance (DeFi) system comprising multiple contracts, including `SimGov`, `SimStable`, and `CentralVault`. These contracts work together to manage collateral, mint/burn tokens, and manage collateral ratios in a decentralized manner.

## Table of Contents
- [Overview](#overview)
- [Contracts](#contracts)
    - [SimGov](#simgov)
    - [SimStable](#simstable)
    - [CentralVault](#centralvault)
    - [MockUniswapV2Pair](#mockuniswapv2pair)
    - [MockERC20](#mockerc20)
- [Deployment](#deployment)
- [Usage](#usage)
- [Testing](#testing)

## Overview
The SimGov and SimStable tokens form the foundation of the system. The CentralVault contract handles minting, burning, redeeming, and collateral management. The collateral assets are used to back the stablecoin SimStable, while SimGov is used to represent governance.

The system features mechanisms for adjusting collateral ratios, re-collateralizing when needed, and executing buybacks to maintain the desired collateral ratio.

### Key Functionalities
- **Minting:** Minting SimStable tokens by providing collateral and SimGov tokens.
- **Redeeming:** Redeeming SimStable tokens in exchange for collateral and SimGov tokens.
- **Collateral Management:** Managing collateral ratios and ensuring stability through collateral adjustments.
- **Buyback:** Buying back SimGov tokens when collateral ratio exceeds a certain threshold.
- **Re-collateralization:** Adding collateral to meet the target collateral ratio.

## Contracts

### SimGov
The SimGov contract is an ERC20 token that represents the governance token for the vault. Only the vault can mint and burn SimGov tokens.

```solidity
contract SimGov is ERC20 {
    address public vault;

    function setVault(address _vault) external;
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}
```

### SimStable
The SimStable contract is an ERC20 token representing a stablecoin pegged to an underlying asset. Like SimGov, only the vault can mint and burn SimStable tokens.

```solidity
contract SimStable is ERC20 {
    address public vault;

    function setVault(address _vault) external;
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}
```

### CentralVault
The CentralVault contract handles minting, redeeming, collateral management, and other financial operations. It uses `SimGov`, `SimStable`, and a collateral token to manage the system's assets.

```solidity
contract CentralVault {
    SimStable public simStable;
    SimGov public simGov;
    IERC20 public collateralToken;
    uint256 public collateralRatio;
    uint256 public targetCR;

    event Minted(address indexed user, uint256 collateralAmount, uint256 govBurned, uint256 stableMinted);
    event Redeemed(address indexed user, uint256 stableAmount, uint256 collateralOut, uint256 govMinted);
}
```

### MockUniswapV2Pair
This mock simulates a Uniswap V2 pair contract. It is used to test price fetching logic in the `CentralVault` contract. The mock allows developers to manually set reserves and token addresses to simulate different pricing scenarios.

**Key Functions:**
- `setReserves(uint112 reserve0, uint112 reserve1)`: Manually sets the reserves for token0 and token1 in the pair.
- `getReserves()`: Returns the reserves for token0 and token1.
- `setToken0(address _newToken0)` and `setToken1(address _newToken1)`: Set the token0 and token1 addresses for the pair.
- `token0()` and `token1()`: Return the respective token addresses in the pair.

**Usage:**
This mock is used to test price updates in the `CentralVault`'s `updatePrices` function and simulate various pricing conditions for both `SimStable` and `SimGov`.

```solidity
contract MockUniswapV2Pair is IUniswapV2Pair {
    uint112 private _reserve0;
    uint112 private _reserve1;
    address private _token0;
    address private _token1;

    function setReserves(uint112 reserve0, uint112 reserve1) external;
    function getReserves() external view returns (uint112, uint112, uint32);
}
```

### MockERC20
This mock is a basic ERC20 token implementation used for testing collateral and token interactions. It provides additional functionality for minting and burning tokens directly, enabling precise control during testing.

**Key Functions:**
- `mint(address to, uint256 amount)`: Mints tokens to the specified address.
- `burn(address from, uint256 amount)`: Burns tokens from the specified address.

**Usage:**
This mock is used as:
- A substitute for the `collateralToken` to test minting and redeeming of `SimStable`.
- A simple ERC20 token to test interactions with the `CentralVault`.

```solidity
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol);
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}
```

## Deployment

To deploy the contracts, you can use the Hardhat or Truffle framework. Here's an example of how you might deploy the contracts using Hardhat.

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Deploy the contracts:**

   Update the deployment script (`deploy.js`) with the correct addresses for the tokens and pairs.

   ```bash
   npx hardhat run scripts/deploy.js --network <network_name>
   ```

## Usage

Once deployed, the contracts allow interaction for minting, redeeming, collateral management, and more. The `CentralVault` contract is the core of the system and allows for minting and redeeming stablecoins based on collateral assets.

### Minting SimStable
To mint `SimStable` tokens, provide `collateral` and `SimGov` tokens, and the vault will mint corresponding `SimStable` tokens.

### Redeeming SimStable
You can redeem `SimStable` tokens to receive collateral and `SimGov` tokens. The redemption will follow the current collateral ratio.

### Managing Collateral
The collateral ratio can be adjusted, and additional collateral can be added to meet the target ratio using the `reCollateralize` function.

## Testing

This project uses Hardhat for testing. You can run the tests using the following command:

```bash
npx hardhat test
```

Remaining test cases:
- Minting of `SimStable` and `SimGov`.
- Redeeming `SimStable`.
- Managing the collateral ratio.
- Adjusting collateral through re-collateralization.
- Buybacks for governance token.
