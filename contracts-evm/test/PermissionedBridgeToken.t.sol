// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PermissionedBridgeToken} from "../src/PermissionedBridgeToken.sol";
import {BridgeAttestationVerifier} from "../src/BridgeAttestationVerifier.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address keyAddr);
    function prank(address sender) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract PermissionedBridgeTokenTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant ISSUER = address(0x1001);
    address private constant BRIDGE = address(0x1002);
    address private constant ALICE = address(0x1003);
    address private constant BOB = address(0x1004);
    uint256 private constant CAP = 1_000_000 ether;
    uint256 private constant ATTESTER_KEY_A = 0xA11CE;
    uint256 private constant ATTESTER_KEY_B = 0xB0B;

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
        vm.expectRevert(PermissionedBridgeToken.InvalidAmount.selector);
        token.bridgeOut("alice.near", 0);

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

    function testThresholdAttestationMintsOnceAndRejectsReplay() public {
        PermissionedBridgeToken token = _token();
        BridgeAttestationVerifier verifier = new BridgeAttestationVerifier(token, keccak256("route-a"), 2);
        token.setBridge(address(verifier));
        address attesterA = vm.addr(ATTESTER_KEY_A);
        address attesterB = vm.addr(ATTESTER_KEY_B);
        vm.prank(ISSUER);
        token.setEligible(ALICE, true);
        verifier.setAttester(attesterA, true);
        verifier.setAttester(attesterB, true);

        BridgeAttestationVerifier.MintAttestation memory attestation = _attestation(ALICE, 77, keccak256("op-1"));
        bytes[] memory signatures = _sign(verifier, attestation);
        verifier.attestAndMint(attestation, signatures);
        _assertEq(token.balanceOf(ALICE), 77);
        _assertEq(token.totalSupply(), 77);

        vm.expectRevert(
            abi.encodeWithSelector(BridgeAttestationVerifier.AlreadyConsumed.selector, attestation.operationId)
        );
        verifier.attestAndMint(attestation, signatures);
    }

    function testThresholdAttestationRejectsDuplicateSignersAndExpiredPayloads() public {
        PermissionedBridgeToken token = _token();
        BridgeAttestationVerifier verifier = new BridgeAttestationVerifier(token, keccak256("route-a"), 2);
        token.setBridge(address(verifier));
        vm.prank(ISSUER);
        token.setEligible(ALICE, true);
        verifier.setAttester(vm.addr(ATTESTER_KEY_A), true);
        verifier.setAttester(vm.addr(ATTESTER_KEY_B), true);

        BridgeAttestationVerifier.MintAttestation memory attestation = _attestation(ALICE, 77, keccak256("op-2"));
        bytes[] memory duplicate = new bytes[](2);
        duplicate[0] = _signOne(ATTESTER_KEY_A, verifier.digest(attestation));
        duplicate[1] = duplicate[0];
        vm.expectRevert(BridgeAttestationVerifier.DuplicateSigner.selector);
        verifier.attestAndMint(attestation, duplicate);

        bytes[] memory valid = _sign(verifier, attestation);
        vm.warp(attestation.expiresAt + 1);
        vm.expectRevert(BridgeAttestationVerifier.AttestationExpired.selector);
        verifier.attestAndMint(attestation, valid);
    }

    function testThresholdAttestationBindsEveryPayloadFieldAndRequiresThreshold() public {
        PermissionedBridgeToken token = _token();
        BridgeAttestationVerifier verifier = new BridgeAttestationVerifier(token, keccak256("route-a"), 2);
        token.setBridge(address(verifier));
        vm.prank(ISSUER);
        token.setEligible(ALICE, true);
        verifier.setAttester(vm.addr(ATTESTER_KEY_A), true);
        verifier.setAttester(vm.addr(ATTESTER_KEY_B), true);

        BridgeAttestationVerifier.MintAttestation memory attestation = _attestation(ALICE, 77, keccak256("op-3"));
        bytes[] memory signatures = _sign(verifier, attestation);
        attestation.amount += 1;
        vm.expectRevert(BridgeAttestationVerifier.InvalidSignature.selector);
        verifier.attestAndMint(attestation, signatures);

        attestation.amount -= 1;
        bytes[] memory oneSignature = new bytes[](1);
        oneSignature[0] = signatures[0];
        vm.expectRevert(BridgeAttestationVerifier.InsufficientSignatures.selector);
        verifier.attestAndMint(attestation, oneSignature);
    }

    function _attestation(address recipient, uint256 amount, bytes32 operationId)
        private
        pure
        returns (BridgeAttestationVerifier.MintAttestation memory)
    {
        return BridgeAttestationVerifier.MintAttestation({
            sourceChainId: 397,
            sourceBridge: keccak256("near-source-bridge"),
            operationId: operationId,
            recipient: recipient,
            amount: amount,
            expiresAt: 10_000
        });
    }

    function _sign(BridgeAttestationVerifier verifier, BridgeAttestationVerifier.MintAttestation memory attestation)
        private
        returns (bytes[] memory signatures)
    {
        signatures = new bytes[](2);
        bytes32 payloadDigest = verifier.digest(attestation);
        signatures[0] = _signOne(ATTESTER_KEY_A, payloadDigest);
        signatures[1] = _signOne(ATTESTER_KEY_B, payloadDigest);
    }

    function _signOne(uint256 privateKey, bytes32 payloadDigest) private returns (bytes memory signature) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, payloadDigest);
        return abi.encodePacked(r, s, v);
    }

    function _assertEq(uint256 left, uint256 right) private pure {
        require(left == right, "unexpected uint256");
    }
}
