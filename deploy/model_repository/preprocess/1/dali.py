# DALI pre-processing for the YOLO models. Triton's DALI backend serializes this
# pipeline when the model loads (@autoserialize), so there is no model.dali file.
#
# Input : ENCODED   - bytes of a JPEG/PNG file, UINT8 [N]
# Output: images    - letterboxed RGB image, FP32 [3, 640, 640], 0..1, CHW
#         LETTERBOX - [scale, pad_x, pad_y, width, height], FP32 [5]; the client
#                     uses it to map boxes back to the original image
#
# Same letterbox as TritonVision Detect(): resize keeping the aspect ratio,
# centre on a 640x640 grey (114) canvas.
#
# Note: DALI cannot skip a bad sample. Bytes that are not an image make the
# pipeline fail and every later request fails too, until the model is reloaded.

import nvidia.dali as dali
import nvidia.dali.fn as fn
import nvidia.dali.types as types
from nvidia.dali.plugin.triton import autoserialize

W, H = 640, 640


@autoserialize
@dali.pipeline_def(batch_size=8, num_threads=4, device_id=0)
def pipe():
    encoded = fn.external_source(device="cpu", name="ENCODED", dtype=types.UINT8, ndim=1)

    # Letterbox geometry, computed on the CPU from the image header.
    shape = fn.cast(fn.peek_image_shape(encoded), dtype=types.FLOAT)    # [h, w, c]
    h, w = shape[0], shape[1]
    scale = dali.math.min(W / w, H / h)
    nw = dali.math.floor(w * scale + 0.5)
    nh = dali.math.floor(h * scale + 0.5)
    px = dali.math.floor((W - nw) / 2)
    py = dali.math.floor((H - nh) / 2)

    # Decode on the GPU. affine=False: thread pinning needs NVML, which cannot
    # query the Jetson iGPU, and every decode then fails with "nvml error (6)".
    img = fn.decoders.image(encoded, device="mixed", output_type=types.RGB, affine=False)
    img = fn.resize(img, resize_x=nw, resize_y=nh, interp_type=types.INTERP_LINEAR, antialias=False)
    img = fn.slice(img, start=fn.cast(fn.stack(-py, -px), dtype=types.INT32), shape=[H, W],
                   axis_names="HW", out_of_bounds_policy="pad", fill_values=114)
    img = fn.crop_mirror_normalize(img, dtype=types.FLOAT, output_layout="CHW",
                                   mean=[0.0, 0.0, 0.0], std=[255.0, 255.0, 255.0])

    letterbox = fn.stack(scale, px, py, w, h)
    return img, letterbox
