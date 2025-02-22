/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

// Imports
const fs = require('fs');
const _regex = /[\w]*AssetParameters/g; //this regular express also takes into account lambda functions defined in nested stacks

// Build context mapping from command line arguments.
//
// Example:
//   --name value --anothername anothervalue
//
// The example will produce an object that looks like:
//   { "name": "value", "anothername": "anothervalue" }
//
// The script looks for the following names:
//  * solution_name
//  * solution_version
//  * bucket_name
const contextMap = (function () {
  const commandLineArgs = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < commandLineArgs.length - 1; ++i) {
    const arg = commandLineArgs[i];
    if (arg.startsWith('--')) {
      const name = arg.substr(2);
      const value = commandLineArgs[++i];
      result[name] = value;
    }
  }
  return result;
}());

// Paths
const global_s3_assets = '../global-s3-assets';

const getAllAssetParameterKeys = (parameters) =>
    Object.keys(parameters).filter((key) => key.search(_regex) > -1);

// For each template in global_s3_assets ...
fs.readdirSync(global_s3_assets).forEach((file) => {
    // Import and parse template file
    const raw_template = fs.readFileSync(`${global_s3_assets}/${file}`);
    let template = JSON.parse(raw_template);

    // Clean-up Lambda function code dependencies
    const resources = template.Resources ? template.Resources : {};
    const lambdaFunctions = Object.keys(resources).filter(function (key) {
        return resources[key].Type === 'AWS::Lambda::Function';
    });
    lambdaFunctions.forEach(function (f) {
        const fn = resources[f];
        if (fn.Properties.Code.hasOwnProperty('S3Bucket')) {
            // Set the S3 key reference
            let artifactHash = Object.assign(fn.Properties.Code.S3Key);
            artifactHash = artifactHash.replace(_regex, '');
            artifactHash = artifactHash.substring(
                0,
                artifactHash.indexOf('.zip')
            );
            const assetPath = `asset${artifactHash}`;
            fn.Properties.Code.S3Key = `${contextMap.solution_name}/${contextMap.solution_version}/${assetPath}.zip`;
            // Set the S3 bucket reference
            fn.Properties.Code.S3Bucket = {
                'Fn::Sub': contextMap.bucket_name,
            };
            // Set the handler
            const handler = fn.Properties.Handler;
            fn.Properties.Handler = `${assetPath}/${handler}`;
        }
    });

    // Clean-up parameters section
    const parameters = template.Parameters ? template.Parameters : {};
    const assetParameters = getAllAssetParameterKeys(parameters);
    assetParameters.forEach(function (a) {
        template.Parameters[a] = undefined;
    });

    // Output modified template file
    const output_template = JSON.stringify(template, null, 2);
    fs.writeFileSync(`${global_s3_assets}/${file}`, output_template);
});
