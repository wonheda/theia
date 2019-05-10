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

#ifndef LINUX_FFMPEG
#define LINUX_FFMPEG

#include <stdlib.h>
#include <dlfcn.h>

#include "ffmpeg.h"

char *load_ffmpeg_library(struct FFMPEG_Library *library, char *library_path)
{
    void *handle = dlopen(library_path, RTLD_NOW);
    char *error = dlerror();
    if (error != NULL)
        goto error;

    void (*avcodec_register_all)(void) = dlsym(handle, "avcodec_register_all");
    error = dlerror();
    if (error != NULL)
        goto error;

    struct AVCodec *(*av_codec_next)(const struct AVCodec *c) = dlsym(handle, "av_codec_next");
    error = dlerror();
    if (error != NULL)
        goto error;

    library->handle = handle;
    library->avcodec_register_all = avcodec_register_all;
    library->av_codec_next = av_codec_next;
    return NULL;

error:
    if (handle != NULL)
        dlclose(handle);
    return error;
}

char *unload_ffmpeg_library(struct FFMPEG_Library *library)
{
    dlclose(library->handle);
    return dlerror();
}

#endif // LINUX_FFMPEG guard
