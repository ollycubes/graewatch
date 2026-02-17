from .bos import detect as bos_detect
from .fvg import detect as fvg_detect

COMPONENTS = {
    "bos": bos_detect,
    "fvg": fvg_detect,
}