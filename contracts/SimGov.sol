// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimGov is ERC20 {
    address public vault;

    constructor() ERC20("SimGov", "SIMG") {}

    // Restricted function to set the vault (can be improved later with access control)
    function setVault(address _vault) external {
        require(vault == address(0), "Vault already set");
        vault = _vault;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == vault, "Only the vault can mint");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == vault, "Only the vault can burn");
        _burn(from, amount);
    }
}
