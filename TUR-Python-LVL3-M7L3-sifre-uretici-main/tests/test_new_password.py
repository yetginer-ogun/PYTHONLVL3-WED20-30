import string
from password.new_password import generate_password

def test_password_characters():
    """Şifre oluşturulurken yalnızca geçerli karakterlerin kullanıldığını test eder"""
    valid_characters = string.ascii_letters + string.digits + string.punctuation
    password = generate_password(100)  # Daha güvenli bir doğrulama için uzun bir şifre oluşturuluyor
    for char in password:
        assert char in valid_characters

"""
Aşağıda önerilenlerden birini kullanarak başka bir test yazın. Alternatif olarak, kendi testinizi de oluşturabilirsiniz!
Daha fazla test yazabilirseniz harika olur!

1. Şifrenin uzunluğunun belirtilen uzunlukla eşleşip eşleşmediğini test edin  
2. Arka arkaya oluşturulan iki şifrenin farklı olup olmadığını test edin 
"""


def test_password_length():
    length = 50
    password = generate_password(length)
    assert len(password) == length, "Parola uzunluğu hatalı"

def test_password_double():
    password1 = generate_password(100)
    password2 = generate_password(100)
    assert password1 != password2, "Parolalar birbirinin aynısı"

def test_password_contains_number():
    password1 = generate_password(1000)
    found = False
    i = 0
    while not found:
        if password1[i].isdigit():
            found = True
        i = i + 1
    assert found == True, "Şifre sayı içermiyor"

def test_password_contains_sign():
    password1 = generate_password(1000)
    found = False
    i = 0
    while not found:
        if password1[i] in "+-*/?-_=()<>|[]&%$#":
            found = True
        i = i + 1
    assert found == True, "Şifre işaret içermiyor"


