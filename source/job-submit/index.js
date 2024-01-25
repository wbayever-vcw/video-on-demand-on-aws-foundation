/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
const { v4: uuidv4} = require('uuid');
const utils = require('./lib/utils.js');

exports.handler = async (event,context) => {
    console.log(context.LogGroupName);
    console.log(`REQUEST:: ${JSON.stringify(event, null, 2)}`);
    const {
        MEDIACONVERT_ENDPOINT,
        MEDIACONVERT_ROLE,
        JOB_SETTINGS,
        DESTINATION_BUCKET,
        SOLUTION_ID,
        STACKNAME,
        SNS_TOPIC_ARN
    } = process.env;
    
    try {
        /**
         * define inputs/ouputs and a unique string for the mediaconver output path in S3. 
         */
        console.log(event);
        const videoKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
        if (videoKey.indexOf('/video/') === -1) {
            return;
        }
        const keyPath = videoKey.substring(0, videoKey.lastIndexOf('/'));
        const srcParts = videoKey.split("/");
        const srcBucket = decodeURIComponent(event.Records[0].s3.bucket.name);
        const settingsFile = `${JOB_SETTINGS}`;
        const inputPath = `s3://${srcBucket}/${videoKey}`;
        const outputPath = `s3://${DESTINATION_BUCKET}/${keyPath}`;
        const metaData = {
            Guid:keyPath,
            StackName:STACKNAME,
            SolutionId:SOLUTION_ID,
            MongoDbId:srcParts[3]
        };
        /**
         * download and validate settings 
         */
        let job = await utils.getJobSettings(srcBucket,settingsFile);
        /**
         * parse settings file to update source / destination
         */
        job = await utils.updateJobSettings(job,inputPath,outputPath,metaData,MEDIACONVERT_ROLE);
        /**
         * Submit Job
         */
        await utils.createJob(job,MEDIACONVERT_ENDPOINT);

    } catch (err) {
        /**
         * Send SNS error message
         */
        await utils.sendError(SNS_TOPIC_ARN,STACKNAME,context.logGroupName,err);
        throw err;
    }
    return;
};
