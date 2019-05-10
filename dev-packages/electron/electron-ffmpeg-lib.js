#!/usr/bin/env node
// @ts-check
/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
'use-strict'

const path = require('path');
const cp = require('child_process');

// @ts-ignore
const ffmpeg = require('./native/build/Release/ffmpeg.node')

/**
 * @param {NodeJS.Platform} [platform]
 * @return {File}
 */
exports.libffmpegLocation = function (platform = process.platform) {
    switch (platform) {
        case 'darwin':
            return {
                name: 'libffmpeg.dylib',
                folder: 'Electron.app/Contents/Frameworks/Electron Framework.framework/Libraries/',
            };
        case 'win32':
            return {
                name: 'ffmpeg.dll',
            };
        case 'linux':
            return {
                name: 'libffmpeg.so',
            };
        default:
            throw new Error(`${process.platform} is not supported`);
    }
}

/**
 * @param {libffmpegPlatformOptions} [options]
 * @return {String}
 */
exports.libffmpegRelativePath = function ({ platform } = {}) {
    const libffmpeg = exports.libffmpegLocation(platform);
    return `${libffmpeg.folder || ''}${libffmpeg.name}`;
}

/**
 * @param {libffmpegDistributionOptions} [options]
 * @return {String}
 */
exports.libffmpegAbsolutePath = function ({ platform, electronDist } = {}) {
    if (!electronDist) electronDist = path.resolve(require.resolve('electron/index.js'), '..', 'dist');
    return path.join(electronDist, exports.libffmpegRelativePath({ platform }));
}

/**
 * @param {libffmpegDistributionOptions} [options]
 * @return {Codec[]}
 */
exports.libffmpegCodecs = function (options = {}) {
    return ffmpeg.codecs(exports.libffmpegAbsolutePath(options))
}

// /**
//  * @param {libffmpegDistributionOptions} [options]
//  * @return {Promise<Codec[]>}
//  */
// exports.libffmpegCodecs = async function (options = {}) {

// }

/**
 * @typedef {Object} File
 * @property {String} name
 * @property {String} [folder]
 */

/**
 * @typedef {Object} Codec
 * @property {Number} id
 * @property {String} name
 * @property {String} longName
 */

/**
 * @typedef {Object} libffmpegPlatformOptions
 * @property {NodeJS.Platform} [platform]
 */

/**
 * @typedef {Object} libffmpegDistributionOptions
 * @property {NodeJS.Platform} [platform]
 * @property {String} [electronDist]
 */
