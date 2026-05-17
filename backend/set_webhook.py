import requests

# Твои данные
TOKEN = "uAKWDjBxDUdFMmj-9Cz5jGfiuRlTLDt0cDI-eJLbBhfw"
URL = "https://evident-doorway-unwitting.ngrok-free.dev/mono-webhook"

def set_webhook():
    response = requests.post(
        "https://api.monobank.ua/api/merchant/webhook/set",
        headers={"X-Token": TOKEN},
        json={"webHookUrl": URL}
    )
    if response.status_code == 200:
        print("✅ Успех! Webhook установлен.")
    else:
        print(f"❌ Ошибка: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    set_webhook()