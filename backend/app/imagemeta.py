import json
import os

from PIL import Image, ExifTags


def _rational_to_float(v):
    try:
        return float(v)
    except Exception:
        try:
            return float(v.numerator) / float(v.denominator)
        except Exception:
            return 0.0


def _dms_to_deg(dms, ref):
    try:
        d = _rational_to_float(dms[0])
        m = _rational_to_float(dms[1])
        s = _rational_to_float(dms[2])
        deg = d + m / 60.0 + s / 3600.0
        if ref in ("S", "W"):
            deg = -deg
        return round(deg, 5)
    except Exception:
        return None


def extract_image_metadata(path: str):
    info = {"width": None, "height": None, "file_size": None, "exif": {}}
    try:
        info["file_size"] = os.path.getsize(path)
    except OSError:
        pass
    try:
        with Image.open(path) as img:
            info["width"], info["height"] = img.size
            exif = img.getexif()
            if exif:
                exif_ifd = {}
                try:
                    exif_ifd = exif.get_ifd(ExifTags.IFD.Exif)
                except Exception:
                    exif_ifd = {}
                gps_ifd = {}
                try:
                    gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
                except Exception:
                    gps_ifd = {}
                out = {}
                for tag_id in ("Make", "Model", "DateTime", "Orientation"):
                    pass
                tag_map = {v: k for k, v in ExifTags.TAGS.items()}
                for name in ("Make", "Model", "DateTime", "DateTimeOriginal",
                             "DateTimeDigitized", "ExposureTime", "ISOSpeedRatings",
                             "FNumber", "FocalLength"):
                    tid = tag_map.get(name)
                    if tid is None:
                        continue
                    if tid in exif:
                        v = exif.get(tid)
                    elif tid in (exif_ifd or {}):
                        v = exif_ifd.get(tid)
                    else:
                        continue
                    try:
                        out[name] = str(v)
                    except Exception:
                        continue
                if gps_ifd:
                    try:
                        lat = gps_ifd.get(2)
                        lat_ref = gps_ifd.get(1)
                        lon = gps_ifd.get(4)
                        lon_ref = gps_ifd.get(3)
                        if lat is not None and lon is not None:
                            flat = _dms_to_deg(lat, lat_ref)
                            flon = _dms_to_deg(lon, lon_ref)
                            if flat is not None and flon is not None:
                                out["GPSLatitude"] = flat
                                out["GPSLongitude"] = flon
                    except Exception:
                        pass
                info["exif"] = out
    except Exception:
        pass
    return info


def compute_phash(path: str):
    try:
        import imagehash
        with Image.open(path) as img:
            return str(imagehash.phash(img))
    except Exception:
        return None


def phash_distance(a: str, b: str):
    try:
        from PIL import Image as _I  # noqa: F401
        ah = int(str(a), 16)
        bh = int(str(b), 16)
        return bin(ah ^ bh).count("1")
    except Exception:
        return None
