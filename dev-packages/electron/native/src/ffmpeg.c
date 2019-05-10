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

/**
 * https://nodejs.org/docs/latest-v10.x/api/n-api.html#n_api_n_api
 */
#include <node_api.h>

#include <string.h>

#include "ffmpeg.h"

/**
 * Return the list of codecs registered in the FFMPEG library.
 */
napi_value codecs(napi_env env, napi_callback_info info)
{
    // We will reuse this `status` for all napi calls.
    napi_status status;

    // Get arguments.
    size_t argc = 1;
    napi_value argv[1];
    status = napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
    if (status != napi_ok || argc < 1)
        napi_throw_error(env, NULL, "invalid arguments");

    // Get first argument as string.
    char path[2048];
    status = napi_get_value_string_utf8(env, argv[0], path, 2048, NULL);
    if (status != napi_ok)
        napi_throw_error(env, NULL, "invalid string argument");

    // Load ffmpeg based on the provided path.
    struct FFMPEG_Library ffmpeg = NULL_FFMPEG_LIBRARY;
    char *error = load_ffmpeg_library(&ffmpeg, path);
    if (error != NULL)
        napi_throw_error(env, NULL, error);

    // Create the JavaScript list that will be returned.
    napi_value codecs;
    status = napi_create_array(env, &codecs);
    if (status != napi_ok)
        napi_throw_error(env, NULL, "napi_create_array fail");

    // Iter over the codecs and push into the list.
    ffmpeg.avcodec_register_all();
    struct AVCodec *codec = ffmpeg.av_codec_next(NULL);
    while (codec != NULL)
    {
        // Create the codec object and assign the properties.
        napi_value object, value;
        napi_create_object(env, &object);

        // id: number
        napi_create_int32(env, codec->id, &value);
        napi_set_named_property(env, object, "id", value);

        // name: string
        napi_create_string_utf8(env, codec->name, strlen(codec->name), &value);
        napi_set_named_property(env, object, "name", value);

        // longName: string
        napi_create_string_utf8(env, codec->long_name, strlen(codec->long_name), &value);
        napi_set_named_property(env, object, "longName", value);

        // Pushing into a JS array requires calling the JS method for that.
        napi_value push_fn;
        napi_get_named_property(env, codecs, "push", &push_fn);
        napi_call_function(env, codecs, push_fn, 1, (napi_value[]){object}, NULL);

        codec = ffmpeg.av_codec_next(codec);
    }

    // Free the ffmpeg library.
    error = unload_ffmpeg_library(&ffmpeg);
    if (error != NULL)
        napi_throw_error(env, NULL, error);

    return codecs;
}

/**
 * https://nodejs.org/docs/latest-v10.x/api/n-api.html#n_api_module_registration
 */
napi_value initialize(napi_env env, napi_value exports)
{
    napi_status status;

    napi_value function;
    status = napi_create_function(env, NULL, 0, codecs, NULL, &function);
    if (status != napi_ok)
        return NULL;

    status = napi_set_named_property(env, exports, "codecs", function);
    if (status != napi_ok)
        return NULL;

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize);
