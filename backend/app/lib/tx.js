'use strict';

import ethUtil from 'ethereumjs-util';
import levelDB from 'lib/db';
const BN = ethUtil.BN;
import config from "../config";
const { prefixes: { utxoPrefix, utxoWithAddressPrefix }, plasmaOperatorAddress } = config;

import { blockNumberLength, tokenIdLength, addressLengthInBytes } from 'lib/dataStructureLengths';
import { PlasmaTransaction } from 'lib/model/tx';

async function getUTXO(blockNumber, token_id) {
  let blockNumberBuffer = ethUtil.setLengthLeft(ethUtil.toBuffer(new BN(blockNumber)), blockNumberLength)
  let tokenIdBuffer = ethUtil.setLengthLeft(ethUtil.toBuffer(token_id), tokenIdLength)
  let query = Buffer.concat([utxoPrefix, blockNumberBuffer, tokenIdBuffer]);  

  try {
    let data = await levelDB.get(query);
    return new PlasmaTransaction(data);
  }
  catch(err) {
    return null;
  }
}

function createDepositTransaction(addressTo, amountBN, token_id) {
  let txData = {
    prev_hash: '',
    prev_block: new BN(0),
    token_id,
    new_owner: ethUtil.addHexPrefix(addressTo)
  };
  
  const tx = new PlasmaTransaction(txData);
  return tx;
}

async function createSignedTransaction(data) {
  let txData = {};
  txData.prev_hash = ethUtil.toBuffer(ethUtil.addHexPrefix(data.prev_hash));
  txData.prev_block = data.prev_block;
  txData.token_id = data.token_id;
  txData.new_owner = data.new_owner;
  txData.signature = data.signature;
    
  let tx = new PlasmaTransaction(txData);
  return tx;
}

async function getAllUtxos(options = {}) {
  return await new Promise((resolve, reject) => {
    try { 
      options = options || {};
      let uxtos = [];    
      let start;
      let end;
      let blockStartIndex;
      let blockEndIndex;
      let count = 0;
      
      if (options.address && ethUtil.isValidAddress(options.address)) {
        let address = ethUtil.toBuffer(options.address);
        start = Buffer.concat([utxoWithAddressPrefix, address, Buffer.alloc(blockNumberLength), Buffer.alloc(tokenIdLength)]);
        end = Buffer.concat([utxoWithAddressPrefix, address, Buffer.from("ff".repeat(blockNumberLength), 'hex'), Buffer.from("9".repeat(tokenIdLength))]);
        blockStartIndex = utxoWithAddressPrefix.length + addressLengthInBytes;
        blockEndIndex = blockStartIndex + blockNumberLength;
      } else {
        start = Buffer.concat([utxoPrefix, Buffer.alloc(blockNumberLength), Buffer.alloc(tokenIdLength)]);
        end = Buffer.concat([utxoPrefix, Buffer.from("ff".repeat(blockNumberLength), 'hex'), Buffer.from("9".repeat(tokenIdLength))]);
        blockStartIndex = utxoPrefix.length;
        blockEndIndex = blockStartIndex + blockNumberLength;  
      }

      levelDB.createReadStream({gte: start, lte: end})
        .on('data', function (data) {
          count++;
          let utxo = new PlasmaTransaction(data.value);
          let blockNumber = ethUtil.bufferToInt(data.key.slice(blockStartIndex, blockEndIndex));
          let hash;
          (options.getHash) && (hash = utxo.getHash());

          if (!options.json) {
            utxo.blockNumber = blockNumber;
            (options.getHash) && (uxtos.hash = hash);
            uxtos.push(utxo);
            return;
          }
          let uxtosJson = utxo.getJson();
          
          uxtosJson.blockNumber = blockNumber;
          (options.getHash) && (uxtosJson.hash =  ethUtil.bufferToHex(hash));
          if (options.includeKeys) {
            uxtosJson.key = data.key;
          }

          uxtos.push(uxtosJson);
        })
        .on('error', function (error) {
            console.log('error', error);
        })
        .on('end', function () {
          if (options && options.count) {
            resolve({ count, uxto: uxtos })
          } else {
            resolve(uxtos)
          }
        })
    }
    catch(error){
      console.log('error', error);
    }
  })
}

module.exports = {
  createDepositTransaction,
  createSignedTransaction,
  getUTXO,
  getAllUtxos
};
