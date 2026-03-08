from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from users.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [('admin', 'Admin'), ('student', 'Student')]

    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    avatar_url = models.URLField(blank=True, max_length=500)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')
    niveau = models.CharField(max_length=10, blank=True, default='')
    filiere = models.CharField(max_length=100, blank=True, default='')
    is_pro = models.BooleanField(default=False)
    stripe_customer_id = models.CharField(max_length=255, blank=True, default='')
    google_id = models.CharField(max_length=255, blank=True, null=True, unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.full_name} <{self.email}>"
