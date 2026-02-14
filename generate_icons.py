import os
from PIL import Image

def process_image():
    source_path = r"C:/Users/methe/.gemini/antigravity/brain/005addcf-d668-4530-8d30-42fda77616e0/uploaded_media_1770087222749.jpg"
    dest_dir = r"c:/Users/methe/Desktop/Rumeli-iskelesi-yonetim"
    
    if not os.path.exists(source_path):
        print(f"Error: Source file not found: {source_path}")
        return

    try:
        img = Image.open(source_path)
        img = img.convert("RGBA")
        
        datas = img.getdata()
        newData = []
        for item in datas:
            # Change all white (also shades of whites) to transparent
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
        
        img.putdata(newData)
        
        # Save icon-192.png
        icon192 = img.resize((192, 192), Image.Resampling.LANCZOS)
        icon192.save(os.path.join(dest_dir, "icon-192.png"), "PNG")
        print("Created icon-192.png")
        
        # Save icon-512.png
        icon512 = img.resize((512, 512), Image.Resampling.LANCZOS)
        icon512.save(os.path.join(dest_dir, "icon-512.png"), "PNG")
        print("Created icon-512.png")
        
        # Save favicon.ico
        favicon = img.resize((64, 64), Image.Resampling.LANCZOS)
        favicon.save(os.path.join(dest_dir, "favicon.ico"), "ICO")
        print("Created favicon.ico")
        
    except Exception as e:
        print(f"Error processing image: {e}")

if __name__ == "__main__":
    process_image()
