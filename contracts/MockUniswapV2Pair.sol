// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;
import "./IUniswapV2Pair.sol";

contract MockUniswapV2Pair is IUniswapV2Pair {
    uint112 private _reserve0;
    uint112 private _reserve1;
    address private _token0;
    address private _token1;

    function setReserves(uint112 reserve0, uint112 reserve1) external {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
    }

    function getReserves()
    external
    view
    returns (uint112, uint112, uint32)
    {
        return (_reserve0, _reserve1, 0);
    }

    function setToken0(address _newToken0) external {
        _token0 = _newToken0;
    }

    function setToken1(address _newToken1) external {
        _token1 = _newToken1;
    }

    function token0() external view returns (address) {
        return _token0;
    }

    function token1() external view returns (address) {
        return _token1;
    }
}
