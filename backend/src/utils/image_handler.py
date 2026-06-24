"""Image handling utilities for proof of use uploads."""
import base64
import mimetypes
from typing import Optional, Tuple
MAX_IMAGE_SIZE = 1.1 * 1024 * 1024
ALLOWED_FORMATS = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
def decode_base64_image(base64_data: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Decode base64-encoded image data.
    Args:
        base64_data: Base64-encoded image string
    Returns:
        Tuple of (decoded_bytes, filename) or (None, None) if invalid
    """
    try:
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]
        decoded_bytes = base64.b64decode(base64_data)
        if len(decoded_bytes) > MAX_IMAGE_SIZE:
            return None, f"Image exceeds maximum size of 1.1 MB ({len(decoded_bytes) / (1024*1024):.1f} MB)"
        return decoded_bytes, None
    except Exception as e:
        return None, f"Failed to decode image: {str(e)}"
def validate_image_data(image_data: bytes) -> Tuple[bool, Optional[str]]:
    """
    Validate image data (size, format).
    Args:
        image_data: Raw image bytes
    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(image_data) > MAX_IMAGE_SIZE:
        return False, f"Image exceeds maximum size of 1.1 MB ({len(image_data) / (1024*1024):.1f} MB)"
    if len(image_data) < 1:
        return False, "Image data is empty"
    image_signatures = {
        b'\xFF\xD8\xFF': 'jpg',
        b'\x89PNG\r\n': 'png',
        b'RIFF': 'webp',
        b'GIF8': 'gif',
    }
    for signature, fmt in image_signatures.items():
        if image_data.startswith(signature):
            return True, None
    return False, "Invalid image format or corrupted file"
def get_filename_from_base64(base64_data: str, original_filename: Optional[str] = None) -> str:
    """
    Extract or generate a filename for the image.
    Args:
        base64_data: Base64-encoded image
        original_filename: Optional original filename
    Returns:
        Sanitized filename
    """
    if original_filename:
        import os
        filename = os.path.basename(original_filename)
        filename = "".join(c for c in filename if c.isalnum() or c in '._-')
        if filename:
            return filename
    if 'PNG' in base64_data[:50]:
        return 'proof_of_use.png'
    elif 'JFIF' in base64_data[:50] or 'JPEG' in base64_data[:50]:
        return 'proof_of_use.jpg'
    elif 'WEBP' in base64_data[:50]:
        return 'proof_of_use.webp'
    return 'proof_of_use.jpg'
def validate_and_process_image(base64_data: str, filename: Optional[str] = None) -> Tuple[Optional[bytes], Optional[str], Optional[str]]:
    """
    Complete image validation and processing pipeline.
    Args:
        base64_data: Base64-encoded image
        filename: Optional filename
    Returns:
        Tuple of (image_bytes, sanitized_filename, error_message)
    """
    decoded_bytes, decode_error = decode_base64_image(base64_data)
    if decode_error:
        return None, None, decode_error
    is_valid, validation_error = validate_image_data(decoded_bytes)
    if not is_valid:
        return None, None, validation_error
    final_filename = get_filename_from_base64(base64_data, filename)
    return decoded_bytes, final_filename, None
