import string
from password.new_password import generate_password

def test_password_characters():
    """Şifre oluşturulurken yalnızca geçerli karakterlerin kullanıldığını test eder"""
    valid_characters = string.ascii_letters + string.digits + string.punctuation
    password = generate_password(100)  # Daha güvenli bir doğrulama için uzun bir şifre oluşturuluyor
    for char in password:
        assert char in valid_characters

def test_password_length():
    length = 100
    password = generate_password(length)
    assert len(password) == length, "Oluşturulan şifre belirtilen uzunlukta değil."

def test_password_uniqueness():
    password1 = generate_password(100)
    password2 = generate_password(100)
    assert password1 != password2, "Şifreler aynı."

def test_password_num():
    password = generate_password(100)
    found = False
    i = 0
    while not found:
        if password[i].isdigit():
            found = True
        i = i + 1
    assert found == True, "Şifre sayı içermiyor."

def test_password_sign():
    password = generate_password(100)
    found = False
    i = 0
    while not found:
        if password[i] in "+-*/?=(&%^'!><@|`.,)":
            found = True
        i = i + 1
    assert found == True, "Şifre işaret içermiyor."

def test_password_sensitivity():
    password = generate_password(100)
    has_upper = any(char.isupper() for char in password)
    has_lower = any(char.islower() for char in password)
    
    assert has_upper == True, "Şifre büyük harf içermiyor."
    assert has_lower == True, "Şifre küçük harf içermiyor."

def test_password_no_spaces():
    password = generate_password(100)
    assert ' ' not in password, "Şifre boşluk karakteri içeriyor!"

"""
Aşağıda önerilenlerden birini kullanarak başka bir test yazın. Alternatif olarak, kendi testinizi de oluşturabilirsiniz!
Daha fazla test yazabilirseniz harika olur!

1. Şifrenin uzunluğunun belirtilen uzunlukla eşleşip eşleşmediğini test edin  
2. Arka arkaya oluşturulan iki şifrenin farklı olup olmadığını test edin 
"""
