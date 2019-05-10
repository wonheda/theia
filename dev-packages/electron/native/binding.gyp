{
    'targets': [{
        'variables': {
            'platform%': '<(OS)',
        },
        'defines': ['NAPI_VERSION=2'],
        'target_name': 'ffmpeg',
        'sources': [
            'src/ffmpeg.c',
        ],
        'conditions': [
            ['platform=="linux"', {
                'sources': [
                    'src/linux-ffmpeg.c',
                ],
                'libraries': [
                    '-ldl',
                ]
            }],
            ['platform=="mac"', {
                'sources': [
                    'src/mac-ffmpeg.c',
                ]
            }],
            ['platform=="win"', {
                'sources': [
                    'src/win-ffmpeg.c',
                ]
            }],
        ],
    }],
}
