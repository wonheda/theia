#ifndef FFMPEG_H
#define FFMPEG_H
/**
 * THIS FILE REDEFINES DATA AS RETURNED BY THE FFMPEG LIBRARY.
 * HEADER FILES ARE NOT DISTRIBUTED IN OUR SETUP, HENCE THIS.
 */

/**
 * https://ffmpeg.org/doxygen/trunk/avutil_8h_source.html#l00199
 */
enum AVMediaType
{
    _UNKNOWN_DATA_AVMediaType = -1,
};

/**
 * https://ffmpeg.org/doxygen/trunk/avcodec_8h_source.html#l00215
 */
enum AVCodecID
{
    __UNKNOWN_DATA_AVCodecID = 0,
};

/**
 * https://ffmpeg.org/doxygen/trunk/avcodec_8h_source.html#l03476
 */
struct AVCodec
{
    const char *name, *long_name;
    enum AVMediaType type;
    enum AVCodecID id;
};

/**
 * Wrapper around the ffmpeg library that must be loaded at runtime.
 */
struct FFMPEG_Library
{
    void *handle;

    /**
     * https://ffmpeg.org/doxygen/trunk/allcodecs_8c_source.html#l00847
     */
    void (*avcodec_register_all)(void);

    /**
     * https://ffmpeg.org/doxygen/trunk/allcodecs_8c_source.html#l00837
     */
    struct AVCodec *(*av_codec_next)(const struct AVCodec *c);
};

#define NULL_FFMPEG_LIBRARY \
    {                       \
        NULL, NULL, NULL    \
    }

/**
 * Loader that will inject the loaded functions into a FFMPEG_Library structure.
 */
char *load_ffmpeg_library(struct FFMPEG_Library *library, char *library_path);

/**
 * Free library.
 */
char *unload_ffmpeg_library(struct FFMPEG_Library *library);

#endif // FFMPEG_H guard
