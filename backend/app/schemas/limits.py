from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints


class StrictInputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


TinyText = Annotated[str, StringConstraints(max_length=60)]
ShortText = Annotated[str, StringConstraints(max_length=255)]
MediumText = Annotated[str, StringConstraints(max_length=1000)]
LongText = Annotated[str, StringConstraints(max_length=10000)]
RichText = Annotated[str, StringConstraints(max_length=50000)]
EmailText = Annotated[EmailStr, StringConstraints(max_length=254)]
PasswordText = Annotated[str, StringConstraints(max_length=128)]
TokenText = Annotated[str, StringConstraints(max_length=8192)]
UrlText = Annotated[str, StringConstraints(max_length=2048)]
