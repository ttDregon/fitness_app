#!/usr/bin/env python3
import argparse
import os
try:
    import qrcode
except Exception:
    qrcode = None

def main():
    parser = argparse.ArgumentParser(description='Generate QR PNG for a URL')
    parser.add_argument('--url', required=True, help='URL to encode')
    parser.add_argument('--out', required=True, help='Output PNG path')
    args = parser.parse_args()

    if qrcode is None:
        print('qrcode package not installed. Run: pip install "qrcode[pil]"')
        raise SystemExit(1)

    out_dir = os.path.dirname(args.out)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    img = qrcode.make(args.url)
    img.save(args.out)
    print(f'QR saved to {args.out}')

if __name__ == '__main__':
    main()
