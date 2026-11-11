// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PermissionedBridgeToken} from "../src/PermissionedBridgeToken.sol";

interface Vm {
    function prank(address sender) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
}

contract PermissionedBridgeTokenTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant ISSUER = address(0x1001);
    address private constant BRIDGE = address(0x1002);
    address private constant ALICE = address(0x1003);
    address private constant BOB = address(0x1004);
    uint256 private constant CAP = 1_000_000 ether;

    function _token() private returns (PermissionedBridgeToken) {
        return new PermissionedBridgeToken("SYNTHETIC TEST Bridge Gold", "sTGOLD", ISSUER, BRIDGE, CAP);
    }

    function testBridgeMintsOnlyToEligibleAccountAndWithinCap() public {
        PermissionedBridgeToken token = _token();
        vm.prank(ISSUER);
        token.setEligible(ALICE, true);

        vm.prank(BRIDGE);
        token.bridgeMint(ALICE, CAP);
        _assertEq(token.totalSupply(), CAP);
        _assertEq(token.balanceOf(ALICE), CAP);

        vm.prank(BRIDGE);
        vm.expectRevert(PermissionedBridgeToken.CapExceeded.selector);
        token.bridgeMint(ALICE, 1);
    }

    function testOnlyBridgeCanMintAndRecipientMustBeEligible() public {
        PermissionedBridgeToken token = _token();

        vm.prank(ALICE);
        vm.expectRevert(PermissionedBridgeToken.NotBridge.selector);
        token.bridgeMint(ALICE, 1);

        vm.prank(BRIDGE);
        vm.expectRevert(abi.encodeWithSelector(PermissionedBridgeToken.Ineligible.selector, ALICE));
        token.bridgeMint(ALICE, 1);
    }

    function testTransferEnforcesEligibilityForBothParties() public {
        PermissionedBridgeToken token = _token();
        vm.prank(ISSUER);
        token.setEligible(ALICE, true);
        vm.prank(BRIDGE);
        token.bridgeMint(ALICE, 100);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(PermissionedBridgeToken.Ineligible.selector, BOB));
        token.transfer(BOB, 1);

        vm.prank(ISSUER);
        token.setEligible(BOB, true);
        vm.prank(ALICE);
        token.transfer(BOB, 40);
        _assertEq(token.balanceOf(ALICE), 60);
        _assertEq(token.balanceOf(BOB), 40);
    }

    function testEitherProtocolOrIssuerMayPauseBridgeFlows() public {
        PermissionedBridgeToken token = _token();
        vm.prank(ISSUER);
        token.setEligible(ALICE, true);
        vm.prank(BRIDGE);
        token.bridgeMint(ALICE, 100);

        token.setProtocolPaused(true);
        vm.prank(ALICE);
        vm.expectRevert(PermissionedBridgeToken.AssetPaused.selector);
        token.bridgeOut("alice.near", 1);
        token.setProtocolPaused(false);

        vm.prank(ISSUER);
        token.setIssuerPaused(true);
        vm.prank(BRIDGE);
        vm.expectRevert(PermissionedBridgeToken.AssetPaused.selector);
        token.bridgeMint(ALICE, 1);
    }

    function testBridgeOutBurnsAndCreatesSingleUseMonotonicNonce() public {
        PermissionedBridgeToken token = _token();
        vm.prank(ISSUER);
        token.setEligible(ALICE, true);
        vm.prank(BRIDGE);
        token.bridgeMint(ALICE, 100);

        vm.prank(ALICE);
        uint64 firstNonce = token.bridgeOut("alice.near", 30);
        vm.prank(ALICE);
        uint64 secondNonce = token.bridgeOut("alice.near", 20);

        _assertEq(firstNonce, 0);
        _assertEq(secondNonce, 1);
        _assertEq(token.nextBridgeNonce(), 2);
        _assertEq(token.totalSupply(), 50);
        _assertEq(token.balanceOf(ALICE), 50);
    }

    function _assertEq(uint256 left, uint256 right) private pure {
        require(left == right, "unexpected uint256");
    }
}
