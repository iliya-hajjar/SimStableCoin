// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./SimStable.sol";
import "./SimGov.sol";
import "./IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";


contract CentralVault is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    SimStable public simStable;
    SimGov public simGov;
    IERC20 public collateralToken;
    address public simStablePair;
    address public simGovPair;

    uint256 public collateralRatio;
    uint256 public targetCR;
    uint256 public adjustmentCoefficient;
    uint256 public buybackRatio;
    uint256 public minCollateralRatio;
    uint256 public maxCollateralRatio;
    uint256 public pricePeg;

    event CollateralRatioUpdated(uint256 newCR);
    event Minted(address indexed user, uint256 collateralAmount, uint256 govBurned, uint256 stableMinted);
    event Redeemed(address indexed user, uint256 stableAmount, uint256 collateralOut, uint256 govMinted);
    event BuybackExecuted(address indexed user, uint256 govAmount, uint256 collateralReturned);
    event ReCollateralized(address indexed user, uint256 collateralAdded, uint256 govMinted);
    event CollateralRatioAdjusted(uint256 newCR);
    event PricesUpdated(uint256 simStablePrice, uint256 simGovPrice);

    function initialize(
        address initialOwner,
        address _simStable,
        address _simGov,
        address _collateralToken,
        address _simStablePair,
        address _simGovPair
    ) public initializer {
        __Ownable_init(initialOwner);
        __ReentrancyGuard_init();

        simStable = SimStable(_simStable);
        simGov = SimGov(_simGov);
        collateralToken = IERC20(_collateralToken);
        simStablePair = _simStablePair;
        simGovPair = _simGovPair;
        collateralRatio = 15000;
        targetCR = 15000;
        adjustmentCoefficient = 100;
        buybackRatio = 5000;
        minCollateralRatio = 11000;
        maxCollateralRatio = 20000;
        pricePeg = 1e18;
    }

    // Fetch the price of a token from a UniV2 pair
    function getTokenPrice(address pair, address token) public view returns (uint256 price) {
        (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair).getReserves();
        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();

        // Ensure reserves are greater than zero
        require(reserve0 > 0 && reserve1 > 0, "Reserves cannot be zero");

        if (token == token0) {
            return (uint256(reserve1) * 1e18) / uint256(reserve0);
        } else if (token == token1) {
            return (uint256(reserve0) * 1e18) / uint256(reserve1);
        } else {
            revert("Token not in pair");
        }
    }

    // Fetch SimStable and SimGov prices
    function updatePrices() public {
        uint256 simStablePrice = getTokenPrice(simStablePair, address(simStable));
        uint256 simGovPrice = getTokenPrice(simGovPair, address(simGov));

        emit PricesUpdated(simStablePrice, simGovPrice);
    }

    function setTargetCR(uint256 _targetCR) external onlyOwner {
        targetCR = _targetCR;
        emit CollateralRatioUpdated(targetCR);
    }

    function setBuybackRatio(uint256 _buybackRatio) external onlyOwner {
        buybackRatio = _buybackRatio;
    }

    function mintSimGov(address to, uint256 amount) external onlyOwner {
        simGov.mint(to, amount);
    }

    function mintStable(uint256 collateralAmount, uint256 govAmount) external nonReentrant {

        require(collateralAmount > 0, "Collateral must be greater than zero");
        require(govAmount > 0, "SimGov amount must be greater than zero");

        // Update prices before calculations
        uint256 simStablePrice = getTokenPrice(simStablePair, address(simStable));
        uint256 simGovPrice = getTokenPrice(simGovPair, address(simGov));

        // Calculate the total value of collateral and SimGov
        uint256 collateralValue = (collateralAmount * 1e18) / simStablePrice;
        uint256 govValue = (govAmount * simGovPrice) / 1e18;
        uint256 totalValue = collateralValue + govValue;

        // Check that the provided value meets the collateral ratio
        require(totalValue * 1e4 >= collateralRatio * collateralValue, "Insufficient collateral");

        // Transfer collateral and burn SimGov
        require(collateralToken.transferFrom(msg.sender, address(this), collateralAmount), "Collateral transfer failed");
        simGov.burn(msg.sender, govAmount);

        // Mint SimStable tokens to the user
        uint256 stableToMint = (totalValue * simStablePrice) / 1e18;
        simStable.mint(msg.sender, stableToMint);

        emit Minted(msg.sender, collateralAmount, govAmount, stableToMint);
    }

    function redeemStable(uint256 stableAmount) external nonReentrant {
        require(stableAmount > 0, "Invalid stable amount");

        // Update prices before calculations
        uint256 simStablePrice = getTokenPrice(simStablePair, address(simStable));
        uint256 simGovPrice = getTokenPrice(simGovPair, address(simGov));

        // Ensure prices are greater than zero
        require(simStablePrice > 0, "SimStable price is zero");
        require(simGovPrice > 0, "SimGov price is zero");

        // Calculate the total value of SimStable being redeemed (based on price)
        uint256 stableValueInCollateral = (stableAmount * simStablePrice) / 1e18;

        // Calculate collateral and SimGov to return
        uint256 totalCollateral = collateralToken.balanceOf(address(this));
        uint256 totalStableSupply = simStable.totalSupply();

        // Ensure totalStableSupply is greater than zero
        require(totalStableSupply > 0, "No SimStable tokens in circulation");

        // Calculate collateralOut with proper scaling
        uint256 collateralOut = (stableValueInCollateral * totalCollateral * 1e18) / (totalStableSupply * simStablePrice);
        require(collateralOut > 0, "Invalid collateral amount");

        // Calculate govMinted
        uint256 govMinted = (stableValueInCollateral * 1e18) / simGovPrice;

        // Burn SimStable tokens and transfer collateral
        simStable.burn(msg.sender, stableAmount);
        require(collateralToken.transfer(msg.sender, collateralOut), "Collateral transfer failed");

        // Mint SimGov tokens
        simGov.mint(msg.sender, govMinted);

        emit Redeemed(msg.sender, stableAmount, collateralOut, govMinted);
    }

    function buybackSimGov(uint256 govAmount) external nonReentrant {
        require(collateralRatio > targetCR, "Buyback not allowed: CR below target");
        require(govAmount > 0, "Invalid SimGov amount");

        // Update prices before calculations
        uint256 simGovPrice = getTokenPrice(simGovPair, address(simGov));
        require(simGovPrice > 0, "SimGov price is zero");

        // Calculate maximum allowable buyback
        uint256 totalCollateral = collateralToken.balanceOf(address(this));
        uint256 maxBuybackCollateral = (totalCollateral * buybackRatio) / 1e4;
        uint256 collateralToReturn = (govAmount * simGovPrice) / 1e18;

        require(collateralToReturn > 0 && collateralToReturn <= maxBuybackCollateral, "Invalid buyback amount");

        // Burn SimGov tokens and transfer collateral
        simGov.burn(msg.sender, govAmount);
        require(collateralToken.transfer(msg.sender, collateralToReturn), "Collateral transfer failed");

        emit BuybackExecuted(msg.sender, govAmount, collateralToReturn);
    }

    function setCollateralRatio(uint256 newCR) external onlyOwner {
        collateralRatio = newCR;
    }

    function adjustCollateralRatio() public {
        uint256 priceSimStable = getTokenPrice(simStablePair, address(simStable));

        // Calculate new collateral ratio
        int256 deviation = int256(pricePeg) - int256(priceSimStable);
        int256 adjustment = (int256(adjustmentCoefficient) * deviation) / 1e18;
        int256 newCR = int256(collateralRatio) + adjustment;

        // Ensure CR stays within bounds
        if (newCR < int256(minCollateralRatio)) {
            newCR = int256(minCollateralRatio);
        } else if (newCR > int256(maxCollateralRatio)) {
            newCR = int256(maxCollateralRatio);
        }

        // Update CR and emit event
        collateralRatio = uint256(newCR);
        emit CollateralRatioAdjusted(collateralRatio);
    }

    function reCollateralize(uint256 collateralAmount) external nonReentrant {
        require(collateralRatio < targetCR, "Re-collateralization not required");
        require(collateralAmount > 0, "Invalid collateral amount");

        // Calculate shortfall
        uint256 totalStableSupply = simStable.totalSupply();
        uint256 targetCollateral = (totalStableSupply * targetCR) / 1e4;
        uint256 currentCollateral = collateralToken.balanceOf(address(this));
        uint256 shortfall = targetCollateral > currentCollateral
            ? targetCollateral - currentCollateral
            : 0;

        require(collateralAmount <= shortfall, "Collateral exceeds shortfall");

        // Transfer collateral from user
        require(
            collateralToken.transferFrom(msg.sender, address(this), collateralAmount),
            "Collateral transfer failed"
        );

        // Mint SimGov tokens to user
        uint256 govMintAmount = collateralAmount; // 1:1 collateral to SimGov ratio
        simGov.mint(msg.sender, govMintAmount);

        // Update CR
        uint256 newCollateral = currentCollateral + collateralAmount;
        collateralRatio = (newCollateral * 1e4) / totalStableSupply;

        emit ReCollateralized(msg.sender, collateralAmount, govMintAmount);
    }

    function onSimStableTransfer() external {
        adjustCollateralRatio();
    }
}