import validator from "validator";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import crypto from "crypto";
import { OTP } from "../models/otp.model.js";
import { sendVerificationCode } from "../utils/nodemailer.js";
import { mkdir } from "fs";

export const generateAccessAndRefreshToken = async (userId) => {
  const user = await User.findById(userId);
  const accessToken = await user.generateAccessToken();
  const refreshToken = await user.generateRefreshToken();

  user.refreshToken = refreshToken;
  await user.save({ validationBeforeSave: false });

  return { accessToken, refreshToken };
};

export const signupUser = async (req, res) => {
  try {
    const { username, name, email, password } = req.body;

    // Finding empty field
    if (
      [username, name, email, password].some(
        (field) => field?.trim() === "" || field === undefined,
      )
    ) {
      throw new Error("An input field is empty");
    }

    // Checking if user already exists
    const existedUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existedUser) {
      throw new Error("User already exist");
    }

    //Making User's directory to store their uploaded PDF.
    mkdir(`data/${username}`, { recursive: true }, async (err) => {
      if (err) throw new Error("Failed to create User namespace");
      else {
        const user = await User.create({
          username: username,
          name: name,
          email: email,
          password: password,
        });

        const createdUser = await User.findById(user._id).select("-password");

        return res.status(200).json(new ApiResponse(200, createdUser));
      }
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};

export const signinUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Checking if a field is empty
    if (
      [email, password].some(
        (field) => field?.trim() === "" || field === undefined,
      )
    ) {
      throw new Error("An input field is empty or undefined");
    }

    const user = await User.findOne({
      $or: [{ email }, { password }],
    });

    if (!user) {
      throw new Error("User not registered");
    }

    const passwordCorrect = await user.isPasswordCorrect(password);

    if (!passwordCorrect) {
      throw new Error("User password wrong");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id,
    );

    const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken",
    );
    const options = {
      httpOnly: true,
      secure: true,
      sameSite: "None",
    };

    res
      .status(200)
      .cookie("refreshToken", refreshToken, options)
      .cookie("accessToken", accessToken, options)
      .json(
        new ApiResponse(
          200,
          {
            user: loggedInUser,
            refreshToken,
            accessToken,
          },
          "user logged in successfully",
        ),
      );
  } catch (error) {
    console.log(error.message);
    res.status(500).json({
      error: error.message,
    });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!validator.isEmail(email)) {
      throw new Error("Invalid email address");
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("User not found");
    }

    // Generate OTP
    const otp = crypto.randomInt(100000, 999999).toString();

    // Check if an OTP already exists for this user
    const existingOTP = await OTP.findOne({
      userId: user._id,
      purpose: "PASSWORD_RESET",
      verified: false,
    });

    if (existingOTP) {
      // Update existing OTP
      existingOTP.otp = otp;
      await existingOTP.save();
    } else {
      // Create OTP document
      await OTP.create({
        userId: user._id,
        otp: otp,
        purpose: "PASSWORD_RESET",
      });
    }

    //TODO: Convert it into Promise.
    await sendVerificationCode(user.email, otp);

    res.status(200).json(new ApiResponse(200, "OTP sent to email"));
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
    });
  }
};

//TODO: it needs more edge cases handling
export const resetPassword = async (req, res) => {
  try {
    const user = req.user;

    const { otp, password } = req.body;

    if (!otp || !password) {
      throw new Error("Missing required fields");
    }

    // Find the OTP document
    const otpDoc = await OTP.findOne({
      userId: user._id,
      purpose: "PASSWORD_RESET",
    });

    console.log(otpDoc);
    if (!otpDoc) {
      throw new Error("OTP expired or not found");
    }

    // Verify OTP
    if (otpDoc.otp !== otp) {
      throw new Error("Incorrect OTP");
    }

    // Update password
    const loggedInUser = await User.findOne({ _id: user._id });
    loggedInUser.password = password;
    await loggedInUser.save();

    // Mark OTP as verified
    otpDoc.verified = true;
    await otpDoc.save();
    res.status(200).json(new ApiResponse(200, "Password reset successful"));
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
    });
  }
};

//TODO: it is not the right way to signout. Implement better method
export const signOut = async (req, res) => {
  try {
    await User.findByIdAndUpdate(
      req.user._id,
      {
        $unset: {
          refreshToken: 1,
        },
      },
      {
        new: true,
      },
    );
    const options = {
      httpOnly: true,
      secure: false,
    };
    res
      .status(200)
      .cookie("refreshToken", options)
      .cookie("accessToken", options)
      .json(new ApiResponse(200, {}, "User logged out"));
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
    });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const user = req.user;
    const loggedUser = await User.findById(user._id);

    if (!loggedUser) {
      throw new Error("User not found");
    }
    res.status(200).json(loggedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateImageUrl = async (req, res) => {
  try {
    //TODO: get the image file, uplaod into Cloudinary, update imageUrl with cloudinary ID;
    const { imageUrl } = req.body;
    const user = req.user;

    if (!imageUrl?.trim()) {
      throw new Error("Image URL is required");
    }

    // Validate and update the user
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { imageUrl },
      { new: true, runValidators: true },
    ).select("-password -refreshToken");

    if (!updatedUser) {
      throw new Error("User not found");
    }

    res
      .status(200)
      .json(
        new ApiResponse(200, updatedUser, "Profile image updated successfully"),
      );
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.message,
    });
  }
};
